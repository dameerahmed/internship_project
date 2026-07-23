import re

file_path = r'd:\internship\backend\app\services\queue_client.py'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure celery_app is imported
if 'from backend.app.services.celery_worker import celery_app' not in content:
    content = 'from backend.app.services.celery_worker import celery_app\n' + content

requeue_pattern = re.compile(r'    async def requeue_dlq_messages.*?return \{"replayed_count": len\(requeued_ids\), "replayed_ids": requeued_ids\}', re.DOTALL)

new_requeue = '''    async def requeue_dlq_messages(self, target_ids: list = None) -> dict:
        """
        Takes REAL messages directly from RabbitMQ DLQ and pushes them BACK into the main queue.
        Removes them from DLQ via ack() and publishes to main exchange.
        """
        await self._ensure_channel()

        try:
            dlq_queue = await self._get_dlq_queue_passive()
            queue_count = self._get_message_count(dlq_queue)

            if queue_count == 0:
                return {"replayed_count": 0, "replayed_ids": []}

            requeued_ids = []
            target_set = set(str(i) for i in target_ids) if target_ids and "all" not in target_ids else None
            drain_limit = queue_count if queue_count > 0 else 500

            for _ in range(drain_limit):
                msg = await dlq_queue.get(fail=False)
                if not msg:
                    break

                raw_id = str(msg.message_id or "")
                raw_body = msg.body.decode("utf-8") if isinstance(msg.body, (bytes, bytearray)) else str(msg.body)

                should_requeue = False
                if target_set is None:  # "all"
                    should_requeue = True
                else:
                    if raw_id in target_set:
                        should_requeue = True
                    else:
                        for tid in target_set:
                            if tid in raw_id or tid in raw_body:
                                should_requeue = True
                                break

                if should_requeue:
                    # 1. Acknowledge and remove from DLQ
                    await msg.ack()
                    
                    # 2. Parse payload to get the delivery packet
                    try:
                        import json
                        parsed_body = json.loads(raw_body)
                        delivery_packet = parsed_body.get("delivery_packet") or parsed_body
                    except Exception:
                        delivery_packet = {"raw_content": raw_body}

                    # 3. Publish back into main queue AS A PROPER CELERY TASK
                    celery_app.send_task(
                        "backend.app.services.celery_worker.dispatch_webhook_task",
                        kwargs={"delivery_packet": delivery_packet}
                    )
                    requeued_ids.append(raw_id or f"msg_{len(requeued_ids)+1}")
                else:
                    # Return unmatched message to DLQ
                    await msg.nack(requeue=True)

            return {"replayed_count": len(requeued_ids), "replayed_ids": requeued_ids}'''

content = requeue_pattern.sub(new_requeue, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
