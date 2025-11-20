-- Local MySQL setup for Research Flow (development)
-- Creates a NEW database on the same MySQL server (separate from infrazen_dev).
-- Edit the password before running.

-- Adjust password before use
-- Strongly recommended to replace CHANGE_ME_STRONG_PASSWORD

CREATE DATABASE IF NOT EXISTS `research_flow_dev`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'research_flow_user'@'localhost'
  IDENTIFIED BY 'research_flow_password';

GRANT ALL PRIVILEGES ON `research_flow_dev`.*
  TO 'research_flow_user'@'localhost';

FLUSH PRIVILEGES;

-- Verify (optional, comment out if your client blocks SHOW)
-- SHOW GRANTS FOR 'research_flow_user'@'localhost';
-- SHOW DATABASES LIKE 'research_flow_dev';


