#!/bin/sh
set -eu

certificate="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
private_key="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

if [ -s "$certificate" ] && [ -s "$private_key" ]; then
    template=/opt/deployforge/nginx.tls.conf
    echo "DeployForge Nginx: valid certificate files found; enabling TLS configuration"
else
    template=/opt/deployforge/nginx.bootstrap.conf
    echo "DeployForge Nginx: certificate not present; starting HTTP ACME bootstrap configuration"
fi

envsubst '${DOMAIN} ${dollar}' < "$template" > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
