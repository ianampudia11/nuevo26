@echo off
set "ZIP_NAME=powerchat.zip"

echo Creating zip archive: %ZIP_NAME%...

:: Using Windows built-in tar command to zip specific selected items
tar -a -c -f %ZIP_NAME% ^
 dist ^
 migrations ^
 translations ^
 .dockerignore ^
 .env ^
 .env.development ^
 .gitignore ^
 backup.sh ^
 cookies.txt ^
 docker-compose.template.yml ^
 docker-compose.yml ^
 docker-entrypoint.sh ^
 docker-entrypoint-deploy.sh ^
 docker-entrypoint-simple.sh ^
 Dockerfile ^
 Dockerfile.deploy ^
 Dockerfile.simple ^
 drizzle.config.js ^
 drizzle.config.ts ^
 eslint.config.js ^
 init-db.sql ^
 install.sh ^
 migrate.sh ^
 package.json ^
 package-lock.json ^
 postcss.config.js ^
 run-migration.ts ^
 start.js ^
 tailwind.config.ts ^
 test_contacts.csv ^
 theme.json ^
 tsconfig.json ^
 tsx.config.json ^
 update.sh ^
 vite.config.ts

echo.
echo Operation complete! Created %ZIP_NAME%
pause