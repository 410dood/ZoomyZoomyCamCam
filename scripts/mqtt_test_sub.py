# Throwaway MQTT test subscriber: prints every zoomy/# message, one per line.
import asyncio

from amqtt.client import MQTTClient


async def main():
    c = MQTTClient(client_id="zoomy-test-sub")
    await c.connect("mqtt://127.0.0.1:1883")
    await c.subscribe([("zoomy/#", 1)])
    print("SUBSCRIBED", flush=True)
    while True:
        msg = await c.deliver_message()
        pkt = msg.publish_packet
        print(pkt.variable_header.topic_name, "::", pkt.payload.data.decode(), flush=True)


asyncio.run(main())
