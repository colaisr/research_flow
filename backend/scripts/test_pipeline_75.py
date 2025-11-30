#!/usr/bin/env python3
"""
Script to test pipeline 75 and capture all RAG tool execution details.
This will show inputs, outputs, chunks, and all relevant information.
"""
import sys
import os
import logging
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging to see all RAG Tool messages
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('pipeline_75_test.log', mode='w')
    ]
)

from app.core.database import SessionLocal
from app.models.analysis_type import AnalysisType
from app.models.user import User
from app.models.organization import Organization
from app.services.analysis.pipeline import AnalysisPipeline

def main():
    """Run pipeline 75 and capture all details."""
    db = SessionLocal()
    
    try:
        # Get pipeline 75
        pipeline_id = 75
        analysis_type = db.query(AnalysisType).filter(AnalysisType.id == pipeline_id).first()
        
        if not analysis_type:
            print(f"ERROR: Pipeline {pipeline_id} not found!")
            return
        
        print(f"Found pipeline: {analysis_type.display_name}")
        print(f"Config: {analysis_type.config}")
        print("\n" + "="*80 + "\n")
        
        # Get a user (you may need to adjust this)
        user = db.query(User).first()
        if not user:
            print("ERROR: No users found in database!")
            return
        
        # Get organization from user (via organization_members table)
        from app.models.organization import OrganizationMember
        org_member = db.query(OrganizationMember).filter(OrganizationMember.user_id == user.id).first()
        org = org_member.organization if org_member else None
        
        # If no org member, try to get personal org
        if not org:
            from app.services.organization import get_user_personal_organization
            org = get_user_personal_organization(db, user.id)
        
        print(f"Using user: {user.email} (id={user.id})")
        if org:
            print(f"Organization: {org.name} (id={org.id})")
        print("\n" + "="*80 + "\n")
        
        # Build context (no market data needed for RAG queries)
        context = {
            "instrument": "N/A",
            "timeframe": "N/A",
            "market_data": None,
            "previous_steps": {},
            "_db_session": db,
            "_user_id": user.id,
            "_organization_id": org.id if org else None,
            "_run_id": None,
            "_source_name": analysis_type.display_name,
        }
        
        # Run test pipeline
        print("Starting pipeline execution...\n")
        pipeline = AnalysisPipeline()
        result = pipeline.test_pipeline(
            config=analysis_type.config,
            context=context,
            db=db
        )
        
        print("\n" + "="*80)
        print("PIPELINE EXECUTION RESULTS")
        print("="*80 + "\n")
        
        for step_result in result.get("steps", []):
            print(f"\n{'='*80}")
            print(f"STEP: {step_result.get('step_name', 'Unknown')}")
            print(f"{'='*80}")
            print(f"Status: {'✓ Success' if not step_result.get('error') else '✗ Error'}")
            print(f"Model: {step_result.get('model', 'N/A')}")
            print(f"Tokens: {step_result.get('tokens_used', 0)}")
            print(f"Cost: ${step_result.get('cost_est', 0):.6f}")
            
            if step_result.get('error'):
                print(f"\nERROR: {step_result.get('error')}")
            else:
                input_text = step_result.get('input', '')
                output_text = step_result.get('output', '')
                
                print(f"\n--- INPUT (first 1000 chars) ---")
                print(input_text[:1000])
                if len(input_text) > 1000:
                    print(f"... ({len(input_text) - 1000} more chars)")
                
                print(f"\n--- OUTPUT (first 2000 chars) ---")
                print(output_text[:2000])
                if len(output_text) > 2000:
                    print(f"... ({len(output_text) - 2000} more chars)")
        
        print(f"\n{'='*80}")
        print(f"TOTAL TOKENS: {result.get('total_tokens', 0)}")
        print(f"TOTAL COST: ${result.get('total_cost', 0):.6f}")
        print(f"STATUS: {result.get('status', 'unknown')}")
        if result.get('error'):
            print(f"ERROR: {result.get('error')}")
        print("="*80)
        
        print(f"\nFull results saved to: pipeline_75_test.log")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()

