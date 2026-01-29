if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = "INFO";
}

const isProxied =
  process.env.PROXIED === "true" ||
  process.env.PROXIED === "1" ||
  !process.env.PROXIED;
const domainType = process.env.CF_DOMAIN_TYPE || "A";
const logLevel = process.env.LOG_LEVEL
  ? process.env.LOG_LEVEL.toLowerCase()
  : "info";

const logger = {
  debug: (msg) => {
    if (["debug"].includes(logLevel)) {
      console.log(`DEBUG: ${msg}`);
    }
  },
  info: (msg) => {
    if (["debug", "info"].includes(logLevel)) {
      console.log(`INFO: ${msg}`);
    }
  },
  error: (msg) => {
    console.error(`ERROR: ${msg}`);
  },
};

const cloudflareHeaders = {
  Authorization: `Bearer ${process.env.CF_API_KEY}`,
  "Content-Type": "application/json",
};

async function getZoneId(domain) {
  logger.debug(`Fetching zone ID for domain: ${domain}`);

  // Extract the root domain (e.g., example.com from subdomain.example.com)
  const parts = domain.split(".");
  const rootDomain = parts.slice(-2).join(".");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`,
    {
      headers: cloudflareHeaders,
    },
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch zone ID. (Error ${res.status}: ${res.statusText})`,
    );
  }

  const json = await res.json();

  if (!json.result || json.result.length === 0) {
    throw new Error(`No zone found for domain: ${rootDomain}`);
  }

  const zoneId = json.result[0].id;
  logger.debug(`Found zone ID: ${zoneId}`);
  return zoneId;
}

async function getRecordId(zoneId, domain) {
  logger.debug(`Fetching DNS record ID for: ${domain}`);

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${domain}&type=A`,
    {
      headers: cloudflareHeaders,
    },
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch DNS records. (Error ${res.status}: ${res.statusText})`,
    );
  }

  const json = await res.json();

  if (!json.result || json.result.length === 0) {
    logger.info(`No A record found for ${domain}. Will create one.`);
    return null;
  }

  const recordId = json.result[0].id;
  const currentIp = json.result[0].content;
  logger.debug(`Found record ID: ${recordId} with IP: ${currentIp}`);
  return { recordId, currentIp };
}

async function createDnsRecord(zoneId, domain, ip) {
  logger.info(`Creating DNS record for ${domain} with IP ${ip}...`);

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      headers: cloudflareHeaders,
      body: JSON.stringify({
        type: domainType,
        name: domain,
        content: ip,
        ttl: 1,
        proxied: isProxied,
      }),
    },
  );

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(
      `Could not create DNS record. (Error ${res.status}: ${res.statusText}) - ${JSON.stringify(errorData)}`,
    );
  }

  const json = await res.json();
  logger.info(`DNS record created successfully. Record ID: ${json.result.id}`);
  return json.result.id;
}

async function getCloudflareIP(zoneId, recordId) {
  logger.debug("Retrieving Cloudflare IP...");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
    {
      headers: cloudflareHeaders,
    },
  );

  if (!res.ok) {
    throw new Error(
      `Did not receive response from Cloudflare. (Error ${res.status}: ${res.statusText})`,
    );
  }

  const json = await res.json();
  const ip = json.result.content.trim();
  logger.debug(`GET successful. Cloudflare IP: ${ip}`);
  return ip;
}

async function patchCloudflareIP(zoneId, recordId, domain, ip) {
  logger.debug(`Patching Cloudflare IP to ${ip}...`);

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
    {
      method: "PATCH",
      headers: cloudflareHeaders,
      body: JSON.stringify({
        type: domainType,
        name: domain,
        content: ip,
        ttl: 1,
        proxied: isProxied,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Could not patch Cloudflare data. (Error ${res.status}: ${res.statusText})`,
    );
  }

  const json = await res.json();
  logger.debug(`Patch successful. Response: ${JSON.stringify(json)}`);
}

async function getPublicIP() {
  logger.debug("Retrieving public IP...");

  const res = await fetch("http://ipinfo.io/ip");

  if (!res.ok) {
    throw new Error(
      `Did not receive response from ipinfo. (Error ${res.status}: ${res.statusText})`,
    );
  }

  const ip = (await res.text()).trim();
  logger.debug(`GET successful. Public IP: ${ip}`);
  return ip;
}

function sleep() {
  logger.debug("Starting sleep...");
  return new Promise((resolve) =>
    setTimeout(
      () => {
        resolve();
        logger.debug("Waking up...");
      },
      process.env.INTERVAL ? parseInt(process.env.INTERVAL) * 60000 : 300000,
    ),
  );
}

(async function main() {
  let zoneId = null;
  let recordId = null;
  let cacheIP = "";

  while (true) {
    try {
      if (!process.env.CF_API_KEY) {
        throw new Error("Missing Cloudflare API key (CF_API_KEY).");
      }
      if (!process.env.CF_DOMAIN) {
        throw new Error("Missing Cloudflare domain (CF_DOMAIN).");
      }

      // Fetch zone ID if we don't have it
      if (!zoneId) {
        zoneId = await getZoneId(process.env.CF_DOMAIN);
      }

      // Fetch or create record ID if we don't have it
      if (!recordId) {
        const recordInfo = await getRecordId(zoneId, process.env.CF_DOMAIN);

        if (recordInfo) {
          recordId = recordInfo.recordId;
          cacheIP = recordInfo.currentIp;
        } else {
          // Record doesn't exist, create it
          const publicIP = await getPublicIP();
          recordId = await createDnsRecord(
            zoneId,
            process.env.CF_DOMAIN,
            publicIP,
          );
          cacheIP = publicIP;
          logger.info("Initial DNS record created successfully.");
          await sleep();
          continue;
        }
      }

      // Get current public IP
      let publicIP = await getPublicIP();

      // Update if changed
      if (cacheIP !== publicIP) {
        logger.info("Public IP changed. Updating Cloudflare...");
        await patchCloudflareIP(
          zoneId,
          recordId,
          process.env.CF_DOMAIN,
          publicIP,
        );
        logger.info("Cloudflare IP changed.");
        cacheIP = publicIP;
      }
    } catch (e) {
      logger.error(e.message);
    } finally {
      await sleep();
    }
  }
})();
