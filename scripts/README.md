MySQL local setup (development)

This creates a NEW database on the same MySQL server (separate from infrazen_dev, which belongs to another project and should not be touched).

1) Edit the password placeholder in `mysql_local_setup.sql`:
   - Replace `CHANGE_ME_STRONG_PASSWORD` with your local dev password.

2) Apply the script with a privileged MySQL user (root or an admin):

   ```bash
   mysql -u root -p < scripts/mysql_local_setup.sql
   ```

3) Connection details created by the script:
   - Host: `localhost`
   - Port: `3306`
   - Database: `research_flow_dev`
   - Username: `research_flow_user`
   - Password: your chosen password in the script

4) SQLAlchemy DSN (to use in backend `config_local.py`):

   ```
   mysql+pymysql://research_flow_user:YOUR_PASSWORD@localhost:3306/research_flow_dev?charset=utf8mb4
   ```

5) Verify access (optional):

   ```bash
   mysql -u research_flow_user -p -h localhost -P 3306 -e "SHOW DATABASES LIKE 'research_flow_dev';"
   ```


