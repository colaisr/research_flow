-- Local MySQL setup for Max Signal Bot (development)
-- Creates a NEW database on the same MySQL server (separate from infrazen_dev).
-- Edit the password before running.

-- Adjust password before use
-- Strongly recommended to replace CHANGE_ME_STRONG_PASSWORD

CREATE DATABASE IF NOT EXISTS `max_signal_dev`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'max_signal_user'@'localhost'
  IDENTIFIED BY 'max_signal_password';

GRANT ALL PRIVILEGES ON `max_signal_dev`.*
  TO 'max_signal_user'@'localhost';

FLUSH PRIVILEGES;

-- Verify (optional, comment out if your client blocks SHOW)
-- SHOW GRANTS FOR 'max_signal_user'@'localhost';
-- SHOW DATABASES LIKE 'max_signal_dev';


