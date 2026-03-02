-- create databases
CREATE DATABASE IF NOT EXISTS `voidsync`;

-- create root user and grant rights
-- CREATE USER 'root'@'%' IDENTIFIED BY 'password';
-- GRANT ALL ON *.* TO 'root'@'%';

-- create voidsync user and grant rights
CREATE USER 'voidsync'@'%' IDENTIFIED BY 'password';
GRANT ALL ON `voidsync`.* TO 'voidsync'@'%';
