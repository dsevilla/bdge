# Makefile for managing the docker compose environment in this directory.

.PHONY: up down logs shell

up:
	@echo "Starting environment..."
	DUID=$$(id -u) DGID=$$(id -g) docker compose up

down:
	@echo "Stopping environment..."
	DUID=$$(id -u) DGID=$$(id -g) docker compose down

logs:
	@echo "Showing logs..."
	docker compose logs -f

shell:
	@echo "Opening shell in notebook container..."
	docker compose exec notebook /bin/bash
