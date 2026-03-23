.PHONY: api web dev test docker-up docker-down deploy deploy-now deploy-snapshot deploy-verify deploy-rollback

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

# Production deployment
deploy:
	@scripts/deploy.sh full

deploy-now:
	@scripts/deploy.sh deploy

deploy-snapshot:
	@scripts/deploy.sh snapshot

deploy-verify:
	@scripts/deploy.sh verify

deploy-rollback:
	@scripts/deploy.sh rollback
