# Automated Deployment Assistant Rules

- Whenever the user types `start` (or requests to start deployment):
  1. Pull the latest code from git (`git pull`).
  2. Build and start docker containers using docker-compose (`docker-compose up -d --build`).
  3. Run everything in the background without prompting for extra steps.

- Whenever the user types `stop` (or requests to stop deployment):
  1. Stop and bring down all docker containers (`docker-compose down`).
  2. Run everything in the background without prompting for extra steps.
