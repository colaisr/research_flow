#!/usr/bin/env python3
"""
Test script for bot polling lock mechanism.
Tests that only one process can acquire the lock at a time.

Usage:
    python scripts/test_polling_lock.py

This script simulates multiple processes trying to acquire the lock
to verify the lock mechanism works correctly.
"""
import sys
import os
import time
import subprocess
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import _acquire_polling_lock, _release_polling_lock


def test_lock_acquisition():
    """Test that we can acquire the lock."""
    print("🧪 Test 1: Acquiring lock...")
    success, lock_file = _acquire_polling_lock()
    
    if success:
        print("   ✅ Lock acquired successfully")
        if lock_file:
            print(f"   ✅ Lock file object: {lock_file}")
            _release_polling_lock(lock_file)
            print("   ✅ Lock released")
        return True
    else:
        print("   ❌ Failed to acquire lock")
        return False


def test_lock_prevention():
    """Test that a second process cannot acquire the lock."""
    print("\n🧪 Test 2: Testing lock prevention (requires manual test)...")
    print("   This test requires running two instances simultaneously.")
    print("   Run this script in two terminals:")
    print("   Terminal 1: python scripts/test_polling_lock.py --hold")
    print("   Terminal 2: python scripts/test_polling_lock.py --try")
    print("")
    print("   Expected: Terminal 1 acquires lock, Terminal 2 fails")
    
    if "--hold" in sys.argv:
        print("\n   🔒 Holding lock for 10 seconds...")
        success, lock_file = _acquire_polling_lock()
        if success:
            print(f"   ✅ Lock acquired (PID: {os.getpid()})")
            print("   ⏳ Holding for 10 seconds...")
            time.sleep(10)
            _release_polling_lock(lock_file)
            print("   ✅ Lock released")
        else:
            print("   ❌ Failed to acquire lock")
    
    elif "--try" in sys.argv:
        print("\n   🔓 Trying to acquire lock...")
        success, lock_file = _acquire_polling_lock()
        if success:
            print("   ⚠️  Lock acquired (unexpected - another process should hold it)")
            _release_polling_lock(lock_file)
        else:
            print("   ✅ Correctly prevented from acquiring lock")


def test_stale_lock_recovery():
    """Test that stale locks (dead processes) are recovered."""
    print("\n🧪 Test 3: Testing stale lock recovery...")
    
    # Create a fake PID file with a non-existent PID
    pid_file_path = "/tmp/max-signal-bot-polling.pid"
    lock_file_path = "/tmp/max-signal-bot-polling.lock"
    
    # Clean up first
    try:
        os.remove(pid_file_path)
    except:
        pass
    try:
        os.remove(lock_file_path)
    except:
        pass
    
    # Create a fake PID file with a very high PID (unlikely to exist)
    fake_pid = 999999
    with open(pid_file_path, 'w') as f:
        f.write(str(fake_pid))
    
    print(f"   Created fake PID file with PID {fake_pid}")
    
    # Try to acquire lock - should detect stale lock and take over
    success, lock_file = _acquire_polling_lock()
    
    if success:
        print("   ✅ Successfully recovered from stale lock")
        _release_polling_lock(lock_file)
        return True
    else:
        print("   ❌ Failed to recover from stale lock")
        return False


def check_lock_status():
    """Check current lock status."""
    print("\n📊 Current Lock Status:")
    
    lock_file_path = "/tmp/max-signal-bot-polling.lock"
    pid_file_path = "/tmp/max-signal-bot-polling.pid"
    
    lock_exists = os.path.exists(lock_file_path)
    pid_exists = os.path.exists(pid_file_path)
    
    print(f"   Lock file exists: {lock_exists}")
    print(f"   PID file exists: {pid_exists}")
    
    if pid_exists:
        try:
            with open(pid_file_path, 'r') as f:
                pid = int(f.read().strip())
            print(f"   PID in file: {pid}")
            
            # Check if process is alive
            try:
                os.kill(pid, 0)
                print(f"   ✅ Process {pid} is alive")
            except ProcessLookupError:
                print(f"   ⚠️  Process {pid} is dead (stale lock)")
            except PermissionError:
                print(f"   ⚠️  Cannot check process {pid} (permission denied)")
        except Exception as e:
            print(f"   ❌ Error reading PID file: {e}")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Bot Polling Lock Mechanism Test")
    print("=" * 60)
    
    if "--hold" in sys.argv or "--try" in sys.argv:
        test_lock_prevention()
        return
    
    if "--status" in sys.argv:
        check_lock_status()
        return
    
    # Run automated tests
    test1 = test_lock_acquisition()
    test3 = test_stale_lock_recovery()
    check_lock_status()
    
    print("\n" + "=" * 60)
    print("Test Results:")
    print(f"  Lock acquisition: {'✅ PASS' if test1 else '❌ FAIL'}")
    print(f"  Stale lock recovery: {'✅ PASS' if test3 else '❌ FAIL'}")
    print("=" * 60)
    
    if test1 and test3:
        print("\n✅ All automated tests passed!")
        print("\nTo test lock prevention manually:")
        print("  Terminal 1: python scripts/test_polling_lock.py --hold")
        print("  Terminal 2: python scripts/test_polling_lock.py --try")
    else:
        print("\n❌ Some tests failed")
        sys.exit(1)


if __name__ == '__main__':
    main()

