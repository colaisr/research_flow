"""
Script to publish the last succeeded analysis run to Telegram.
"""
import asyncio
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.analysis_run import AnalysisRun
from app.services.telegram.publisher import publish_to_telegram


async def main():
    db = SessionLocal()
    try:
        # Get the last succeeded run
        run = db.query(AnalysisRun).filter(AnalysisRun.status == 'succeeded').order_by(AnalysisRun.created_at.desc()).first()
        if not run:
            print('❌ No succeeded runs found')
            sys.exit(1)
        
        print(f'📊 Found run #{run.id} for {run.instrument.symbol} on {run.timeframe}')
        
        # Get merge step
        merge_step = None
        for step in run.steps:
            if step.step_name == 'merge':
                merge_step = step
                break
        
        if not merge_step or not merge_step.output_blob:
            print('❌ No merge step output found')
            sys.exit(1)
        
        print(f'📝 Merge step output length: {len(merge_step.output_blob)} characters')
        print('📤 Publishing to Telegram...')
        
        # Publish
        result = await publish_to_telegram(merge_step.output_blob, db=db)
        
        if result['success']:
            print(f"✅ Success! Published {result['chunks_sent']} message(s) to {result['users_notified']} user(s)")
            print(f"📨 Message IDs: {result.get('message_ids', [])}")
            if result.get('users_failed', 0) > 0:
                print(f"⚠️  Failed to send to {result['users_failed']} user(s)")
                if result.get('failed_users'):
                    for failed in result['failed_users']:
                        print(f"   - Chat ID {failed['chat_id']}: {failed['error']}")
        else:
            print(f"❌ Failed: {result.get('error', 'Unknown error')}")
            if result.get('failed_users'):
                print("Failed users:")
                for failed in result['failed_users']:
                    print(f"   - Chat ID {failed['chat_id']}: {failed['error']}")
            sys.exit(1)
    finally:
        db.close()


if __name__ == '__main__':
    asyncio.run(main())

