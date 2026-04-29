.PHONY: api web dev test docker-up docker-down deploy

# Development
api:
	cd api && dotnet run

web:
	cd web && npm run dev

dev:
	$(MAKE) api & $(MAKE) web & wait

test:
	cd api && dotnet test

# Local Docker (development)
docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

# Production deployment (shared VM — see TechDebtClub repo deploy/shared/README.md)
deploy:
	@scripts/deploy.sh
