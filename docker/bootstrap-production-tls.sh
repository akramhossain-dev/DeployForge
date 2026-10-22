#!/bin/sh
set -eu

if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "localhost" ]; then
    echo "DOMAIN must be set to the production hostname" >&2
    exit 1
fi
if [ -z "${CERTBOT_EMAIL:-}" ]; then
    echo "CERTBOT_EMAIL must be set" >&2
    exit 1
fi

compose='docker compose -f docker-compose.yml --profile production'

$compose up -d postgres redis migrate api worker web nginx
$compose run --rm certbot

$compose restart nginx
$compose exec nginx nginx -t

echo "TLS activated for ${DOMAIN}"
