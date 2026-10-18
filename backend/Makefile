.PHONY: seed dev-db run test-sqlite test-pg test openapi lint

dev-db:
	docker compose up -d --wait

run:
	go run ./cmd/wallp serve

test-sqlite:
	go test ./...

test-pg:
	TEST_DATABASE_URL="postgres://wallp:wallp@localhost:5433/wallp_test?sslmode=disable" go test -p 1 ./...

test:
	go vet ./...
	go test ./...
	TEST_DATABASE_URL="postgres://wallp:wallp@localhost:5433/wallp_test?sslmode=disable" go test -p 1 ./...

openapi:
	go run ./cmd/wallp openapi > ../admin/openapi.json

lint:
	go vet ./...

seed:
	go run ./cmd/wallp migrate up
	go run ./cmd/wallp import --dir seed/catalog/v1
	go run ./cmd/wallp publish --notes "seed" --ack-warnings
