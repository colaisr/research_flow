"""
Process completed payments that haven't been processed yet.

This script checks for payments with status 'processing' that are actually completed
and adds tokens to user balances.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from app.core.database import SessionLocal
from app.services.payment.tbank_service import TBankPaymentService
from app.services.balance import add_tokens
from sqlalchemy import text
from datetime import datetime, timezone


async def process_completed_payments():
    """Process completed payments and add tokens to balances."""
    db = SessionLocal()
    try:
        # Get processing or pending purchases with payment IDs
        purchases = db.execute(text('''
            SELECT id, payment_id, payment_status, token_amount, user_id, organization_id
            FROM token_purchases
            WHERE payment_status IN ('processing', 'pending') AND payment_id IS NOT NULL
            ORDER BY purchased_at DESC
        ''')).fetchall()
        
        if not purchases:
            print("No processing purchases found.")
            return
        
        service = TBankPaymentService(db=db)
        processed_count = 0
        tokens_added = 0
        
        print(f"Checking {len(purchases)} processing purchases...")
        print("=" * 80)
        
        for p in purchases:
            try:
                # Check payment status with T-Bank
                print(f"\nPurchase ID: {p.id}, Payment ID: {p.payment_id}")
                status = await service.get_payment_status(p.payment_id)
                print(f"  Full status response: {status}")
                tbank_status = status.get('status', 'UNKNOWN')
                parsed_status = service.parse_webhook_status({'Status': tbank_status})
                
                print(f"  T-Bank Status: {tbank_status}")
                print(f"  Parsed Status: {parsed_status}")
                print(f"  Tokens: {p.token_amount:,}")
                
                if parsed_status == 'completed':
                    # Check if already processed
                    check_result = db.execute(
                        text("SELECT payment_status, paid_at FROM token_purchases WHERE id = :purchase_id"),
                        {"purchase_id": p.id}
                    ).fetchone()
                    
                    if check_result and check_result.payment_status == 'completed':
                        print(f"  ⏭️  Already processed, skipping")
                        continue
                    
                    # Add tokens to balance
                    reason = f"Purchased token package (payment_id: {p.payment_id})"
                    balance_result = add_tokens(
                        db=db,
                        user_id=p.user_id,
                        organization_id=p.organization_id,
                        amount=p.token_amount,
                        reason=reason
                    )
                    
                    # Update purchase status
                    db.execute(
                        text("""
                            UPDATE token_purchases
                            SET payment_status = 'completed',
                                paid_at = :paid_at
                            WHERE id = :purchase_id
                        """),
                        {
                            "purchase_id": p.id,
                            "paid_at": datetime.now(timezone.utc),
                        }
                    )
                    db.commit()
                    
                    processed_count += 1
                    tokens_added += p.token_amount
                    print(f"  ✅ Processed! Added {p.token_amount:,} tokens")
                    print(f"  New balance: {balance_result.balance:,} tokens")
                else:
                    print(f"  ⏳ Still {parsed_status}, skipping")
                    
            except Exception as e:
                print(f"  ❌ Error processing purchase {p.id}: {e}")
                import traceback
                traceback.print_exc()
        
        print("\n" + "=" * 80)
        print(f"✅ Processed {processed_count} completed payments")
        print(f"✅ Added {tokens_added:,} tokens total")
        print("=" * 80)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(process_completed_payments())
