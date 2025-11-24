"""
Scheduler service for managing scheduled analysis runs using APScheduler.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from app.models.schedule import Schedule
from app.models.analysis_run import AnalysisRun, TriggerType, RunStatus
from app.models.instrument import Instrument
from app.services.analysis.pipeline import AnalysisPipeline
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler: Optional[BackgroundScheduler] = None


def get_scheduler() -> BackgroundScheduler:
    """Get or create the global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler()
    return _scheduler


def start_scheduler():
    """Start the scheduler."""
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("✅ Scheduler started")
        # Load all active schedules
        load_all_schedules()
    else:
        logger.debug("Scheduler already running")


def stop_scheduler():
    """Stop the scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown()
        logger.info("Scheduler stopped")
    _scheduler = None


def calculate_next_run(schedule: Schedule) -> Optional[datetime]:
    """Calculate the next run time for a schedule."""
    now = datetime.now()
    config = schedule.schedule_config
    
    if schedule.schedule_type == 'daily':
        # Daily at specific time
        time_str = config.get('time', '08:00')
        hour, minute = map(int, time_str.split(':'))
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        return next_run
    
    elif schedule.schedule_type == 'weekly':
        # Weekly on specific day and time
        day_of_week = config.get('day_of_week', 0)  # 0=Monday, 6=Sunday
        time_str = config.get('time', '08:00')
        hour, minute = map(int, time_str.split(':'))
        
        # Calculate days until next occurrence
        days_ahead = (day_of_week - now.weekday()) % 7
        if days_ahead == 0:
            # Today, check if time has passed
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                days_ahead = 7  # Next week
        next_run = now + timedelta(days=days_ahead)
        next_run = next_run.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return next_run
    
    elif schedule.schedule_type == 'interval':
        # Interval in minutes
        interval_minutes = config.get('interval_minutes', 60)
        next_run = now + timedelta(minutes=interval_minutes)
        return next_run
    
    elif schedule.schedule_type == 'cron':
        # Cron expression
        cron_expr = config.get('cron_expression', '0 8 * * *')
        try:
            # Parse cron expression (minute hour day month day_of_week)
            parts = cron_expr.split()
            if len(parts) == 5:
                trigger = CronTrigger(
                    minute=parts[0],
                    hour=parts[1],
                    day=parts[2],
                    month=parts[3],
                    day_of_week=parts[4]
                )
                next_run = trigger.get_next_fire_time(None, now)
                return next_run
        except Exception as e:
            logger.error(f"Error parsing cron expression {cron_expr}: {e}")
    
    return None


def execute_schedule(schedule_id: int):
    """Execute a scheduled analysis run."""
    from datetime import timezone
    from app.services.analysis.pipeline import AnalysisPipeline
    
    db = SessionLocal()
    run = None
    try:
        schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule:
            logger.error(f"Schedule {schedule_id} not found")
            return
        
        if not schedule.is_active:
            logger.info(f"Schedule {schedule_id} is not active, skipping")
            return
        
        # Get analysis type
        analysis_type = schedule.analysis_type
        if not analysis_type:
            logger.error(f"Analysis type {schedule.analysis_type_id} not found for schedule {schedule_id}")
            return
        
        # Get default instrument (or use N/A if not needed)
        # Check if process needs market data by looking at config
        needs_market_data = True
        if analysis_type.config and 'steps' in analysis_type.config:
            # Check if any step uses market data
            needs_market_data = any(
                step.get('data_sources') and 'market_data' in step.get('data_sources', [])
                for step in analysis_type.config.get('steps', [])
            )
        
        if needs_market_data:
            instrument = db.query(Instrument).filter(Instrument.is_enabled == True).first()
            if not instrument:
                logger.warning(f"No enabled instruments found, using N/A for schedule {schedule_id}")
                instrument = db.query(Instrument).filter(Instrument.symbol == 'N/A').first()
                if not instrument:
                    instrument = Instrument(symbol='N/A', type='other', exchange='N/A', is_enabled=True)
                    db.add(instrument)
                    db.commit()
                    db.refresh(instrument)
            instrument_id = instrument.id
            instrument_symbol = instrument.symbol
            timeframe = 'H1'  # Default timeframe
        else:
            # Use N/A instrument for processes that don't need market data
            instrument = db.query(Instrument).filter(Instrument.symbol == 'N/A').first()
            if not instrument:
                instrument = Instrument(symbol='N/A', type='other', exchange='N/A', is_enabled=True)
                db.add(instrument)
                db.commit()
                db.refresh(instrument)
            instrument_id = instrument.id
            instrument_symbol = 'N/A'
            timeframe = 'N/A'
        
        # Create analysis run
        run = AnalysisRun(
            trigger_type=TriggerType.SCHEDULED,
            instrument_id=instrument_id,
            analysis_type_id=schedule.analysis_type_id,
            organization_id=schedule.organization_id,
            timeframe=timeframe,
            status=RunStatus.QUEUED
        )
        db.add(run)
        
        # Update schedule
        schedule.last_run_at = datetime.now()
        schedule.next_run_at = calculate_next_run(schedule)
        
        db.commit()
        db.refresh(run)
        
        logger.info(f"Created scheduled run {run.id} for schedule {schedule_id}")
        
        # Execute pipeline
        try:
            pipeline = AnalysisPipeline()
            pipeline.run(run, db)
            logger.info(f"Successfully executed scheduled run {run.id} for schedule {schedule_id}")
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_traceback = traceback.format_exc()
            logger.error(f"Error executing pipeline for run {run.id}: {error_msg}\n{error_traceback}")
            
            # Update run status to FAILED
            try:
                db.rollback()
                db.refresh(run)
                run.status = RunStatus.FAILED
                run.finished_at = datetime.now(timezone.utc)
                from app.models.analysis_step import AnalysisStep
                error_step = AnalysisStep(
                    run_id=run.id,
                    step_name="pipeline_error",
                    input_blob={"error": error_msg, "traceback": error_traceback},
                    output_blob=f"Pipeline failed: {error_msg}",
                )
                db.add(error_step)
                db.commit()
            except Exception as db_error:
                logger.error(f"Failed to update run status to FAILED: {db_error}")
                db.rollback()
        
    except Exception as e:
        logger.error(f"Error executing schedule {schedule_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


def add_schedule_job(schedule: Schedule):
    """Add a schedule job to the scheduler."""
    scheduler = get_scheduler()
    # Ensure scheduler is running
    if not scheduler.running:
        scheduler.start()
        logger.info("✅ Scheduler started (via add_schedule_job)")
    
    job_id = f"schedule_{schedule.id}"
    
    # Remove existing job if any
    try:
        scheduler.remove_job(job_id)
    except:
        pass
    
    if not schedule.is_active:
        return
    
    next_run = calculate_next_run(schedule)
    if not next_run:
        logger.warning(f"Could not calculate next run for schedule {schedule.id}")
        return
    
    config = schedule.schedule_config
    
    try:
        if schedule.schedule_type == 'daily':
            time_str = config.get('time', '08:00')
            hour, minute = map(int, time_str.split(':'))
            trigger = CronTrigger(hour=hour, minute=minute)
        elif schedule.schedule_type == 'weekly':
            day_of_week = config.get('day_of_week', 0)
            time_str = config.get('time', '08:00')
            hour, minute = map(int, time_str.split(':'))
            trigger = CronTrigger(day_of_week=day_of_week, hour=hour, minute=minute)
        elif schedule.schedule_type == 'interval':
            interval_minutes = config.get('interval_minutes', 60)
            trigger = IntervalTrigger(minutes=interval_minutes)
        elif schedule.schedule_type == 'cron':
            cron_expr = config.get('cron_expression', '0 8 * * *')
            parts = cron_expr.split()
            if len(parts) == 5:
                trigger = CronTrigger(
                    minute=parts[0],
                    hour=parts[1],
                    day=parts[2],
                    month=parts[3],
                    day_of_week=parts[4]
                )
            else:
                logger.error(f"Invalid cron expression: {cron_expr}")
                return
        else:
            logger.error(f"Unknown schedule type: {schedule.schedule_type}")
            return
        
        scheduler.add_job(
            execute_schedule,
            trigger=trigger,
            args=[schedule.id],
            id=job_id,
            replace_existing=True,
            max_instances=1  # Prevent overlapping executions
        )
        
        logger.info(f"Added schedule job {job_id} for schedule {schedule.id}, next run: {next_run}")
        
    except Exception as e:
        logger.error(f"Error adding schedule job for schedule {schedule.id}: {e}", exc_info=True)


def remove_schedule_job(schedule_id: int):
    """Remove a schedule job from the scheduler."""
    scheduler = get_scheduler()
    job_id = f"schedule_{schedule_id}"
    try:
        scheduler.remove_job(job_id)
        logger.info(f"Removed schedule job {job_id}")
    except Exception as e:
        logger.debug(f"Job {job_id} not found or already removed: {e}")


def load_all_schedules():
    """Load all active schedules into the scheduler."""
    db = SessionLocal()
    try:
        schedules = db.query(Schedule).filter(Schedule.is_active == True).all()
        for schedule in schedules:
            try:
                add_schedule_job(schedule)
            except Exception as e:
                logger.error(f"Error loading schedule {schedule.id}: {e}", exc_info=True)
        logger.info(f"Loaded {len(schedules)} active schedules")
    finally:
        db.close()


def reload_schedule(schedule_id: int):
    """Reload a specific schedule."""
    db = SessionLocal()
    try:
        schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if schedule:
            add_schedule_job(schedule)
    finally:
        db.close()

