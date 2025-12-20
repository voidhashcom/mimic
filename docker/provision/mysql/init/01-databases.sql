-- create databases
CREATE DATABASE IF NOT EXISTS `mimic_example`;

-- create root user and grant rights
-- CREATE USER 'root'@'%' IDENTIFIED BY 'password';
-- GRANT ALL ON *.* TO 'root'@'%';

-- create mimic_example user and grant rights
CREATE USER 'mimic_example'@'%' IDENTIFIED BY 'password';
GRANT ALL ON `mimic_example`.* TO 'mimic_example'@'%';
