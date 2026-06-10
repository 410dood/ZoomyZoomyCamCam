"""Standalone WS-Discovery probe to debug camera discovery.

Sends an ONVIF Probe to 239.255.255.250:3702 from every local IPv4
interface and prints responders. Usage: python scripts/wsdiscovery_probe.py
"""

import socket
import uuid

PROBE = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:{}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
</e:Envelope>"""


def local_ipv4s():
    ips = set()
    hostname = socket.gethostname()
    try:
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ips.add(info[4][0])
    except socket.gaierror:
        pass
    # Default-route trick
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
    finally:
        s.close()
    return sorted(ips)


for ip in local_ipv4s():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    try:
        s.bind((ip, 0))
    except OSError as e:
        print(f"[{ip}] bind failed: {e}")
        continue
    s.settimeout(0.5)
    msg = PROBE.format(uuid.uuid4()).encode()
    s.sendto(msg, ("239.255.255.250", 3702))
    found = {}
    import time

    deadline = time.time() + 3
    while time.time() < deadline:
        try:
            data, addr = s.recvfrom(16384)
        except socket.timeout:
            continue
        body = data.decode("utf-8", "replace")
        name = ""
        if "onvif://www.onvif.org/name/" in body:
            rest = body.split("onvif://www.onvif.org/name/", 1)[1]
            end = min([i for i in (rest.find(" "), rest.find("<"), rest.find('"')) if i >= 0] or [len(rest)])
            name = rest[:end]
        found[addr[0]] = name
    print(f"[{ip}] responders: {found if found else 'NONE'}")
    s.close()
