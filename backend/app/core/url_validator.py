"""
SSRF Protection — validate URLs before making outbound requests.

Rejects private/reserved IP ranges, localhost, and link-local addresses
to prevent Server-Side Request Forgery attacks.
"""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def is_safe_url(url: str) -> bool:
    """Check whether a URL is safe to make outbound requests to.

    Rejects:
    - Private IP ranges: 10.x, 172.16-31.x, 192.168.x
    - Loopback: 127.x, ::1
    - Link-local: 169.254.x, fe80::
    - Unspecified: 0.0.0.0, ::
    - Multicast, reserved ranges
    - Non-HTTP(S) schemes
    - URLs without a hostname

    Returns True if the URL is safe, False otherwise.
    """
    try:
        parsed = urlparse(url)

        # Only allow http and https schemes
        if parsed.scheme not in ("http", "https"):
            logger.debug("URL rejected — unsupported scheme: %s", parsed.scheme)
            return False

        hostname = parsed.hostname
        if not hostname:
            logger.debug("URL rejected — no hostname: %s", url)
            return False

        # Resolve hostname to IP addresses
        try:
            addr_infos = socket.getaddrinfo(hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            logger.debug("URL rejected — DNS resolution failed: %s", hostname)
            return False

        for addr_info in addr_infos:
            ip_str = addr_info[4][0]
            try:
                ip = ipaddress.ip_address(ip_str)
            except ValueError:
                logger.debug("URL rejected — invalid IP from DNS: %s", ip_str)
                return False

            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                logger.debug(
                    "URL rejected — resolved to non-routable IP: hostname=%s ip=%s",
                    hostname, ip_str,
                )
                return False

            # Explicitly block 0.0.0.0 (is_unspecified)
            if ip.is_unspecified:
                logger.debug("URL rejected — unspecified address: %s", ip_str)
                return False

        return True

    except Exception as exc:
        logger.warning("URL validation error for %s: %s — rejecting", url, exc)
        return False
