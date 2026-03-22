.PHONY: api web dev test docker-up docker-down deploy

api:
	cd api && dotnet run

web:
	cd web && npm run dev

dev:
	$(MAKE) api & $(MAKE) web & wait

test:
	cd api && dotnet test

docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

deploy:
	docker-compose -f docker-compose.yml up --build -d
