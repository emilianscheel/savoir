# Slack integration status card

This branch adds a Slack bot visual status card for the sponsor integration path.

## Trigger phrases

Ask the bot any of these in Slack:

```text
@Savoir integration status
@Savoir health
@Savoir connected stack
@Savoir pipeline status
```

## What the bot renders

The bot posts a Block Kit card showing:

- Butterbase ingestion state: indexed messages, chats, enrichment count, Neo4j merge count.
- Neo4j graph state: people, Slack messages, and topics available in the graph.
- RocketRide state: whether the RocketRide bridge webhook is configured for enrichment.

It also shows the product pipeline:

```text
Slack → Butterbase → RocketRide → Neo4j → Slack bot
```

## Why this matters for the hackathon

The card makes the mandatory sponsor integrations visible inside Slack instead of only in code or terminal logs. It helps judges see that Butterbase is the app backend, RocketRide is the parsing/enrichment workflow path, and Neo4j is the graph evidence layer used by the bot.
