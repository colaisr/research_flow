MySQL local setup (development)

This creates a NEW database on the same MySQL server (separate from infrazen_dev, which belongs to another project and should not be touched).

1) Edit the password placeholder in `mysql_local_setup.sql`:
   - Replace `CHANGE_ME_STRONG_PASSWORD` with your local dev password.

2) Apply the script with a privileged MySQL user (root or an admin):

   ```bash
   mysql -u root -p < /Users/colakamornik/Desktop/max_signal_bot/scripts/mysql_local_setup.sql
   ```

3) Connection details created by the script:
   - Host: `localhost`
   - Port: `3306`
   - Database: `max_signal_dev`
   - Username: `max_signal_user`
   - Password: your chosen password in the script

4) SQLAlchemy DSN (to use in backend `config_local.py`):

   ```
   mysql+pymysql://max_signal_user:YOUR_PASSWORD@localhost:3306/max_signal_dev?charset=utf8mb4
   ```

5) Verify access (optional):

   ```bash
   mysql -u max_signal_user -p -h localhost -P 3306 -e "SHOW DATABASES LIKE 'max_signal_dev';"
   ```


