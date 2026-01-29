# Cloudflare DNS Change

A Node.js script that automatically updates your Cloudflare DNS records with your current public IP address. This is useful for managing dynamic DNS (DDNS) for domains hosted on Cloudflare without requiring a dedicated DDNS service.

## How It Works

The script:
1. Retrieves your current public IP address
2. Checks if the IP differs from what's currently set in Cloudflare
3. Updates the DNS record if the IP has changed
4. Repeats this process at regular intervals

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CF_API_KEY` | Yes | - | Cloudflare API token with DNS edit permissions |
| `CF_DOMAIN` | Yes | - | The domain/subdomain to update (e.g., `example.com` or `subdomain.example.com`) |
| `CF_DOMAIN_TYPE` | No | `A` | DNS record type (`A`, `AAAA`, etc.) |
| `INTERVAL` | No | `5` | Time in minutes between IP checks |
| `PROXIED` | No | `true` | Whether the DNS record should be proxied through Cloudflare (`true`, `1`, or `false`) |
| `LOG_LEVEL` | No | `INFO` | Logging verbosity (`INFO` or `DEBUG`) |

## Docker Installation

Run the following command to start the script in Docker:

```bash
docker run -d --name cloudflare-dns-change -e CF_API_KEY="your_api_key" -e CF_DOMAIN="example.com" ghcr.io/anthonyma94/cloudflare-dns-change
```

Replace `your_api_key` with your Cloudflare API token and `example.com` with your domain.

## Cloudflare API Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to your domain
3. Go to **API Tokens** (bottom of left sidebar)
4. Create a new token with **Edit DNS** permissions
5. Copy the token and use it as `CF_API_KEY`
