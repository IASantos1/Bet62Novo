---
name: Stripe payments integration
description: How Stripe replaced ifthenpay — architecture decisions for Multibanco, MB WAY, Card, and webhook
---

# Stripe Payments (replaced ifthenpay)

**Why:** User requested Stripe to replace ifthenpay. Stripe has native Multibanco (EUR PaymentIntent) and Card (Checkout Session), but NO native MB WAY.

## Architecture

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` stored as Replit secrets
- Uses bare `stripe` SDK (not `stripe-replit-sync`) — credentials read directly from env vars, no Replit connector needed
- `getStripe()` in `payments.ts` creates a fresh client per request

## Payment method mapping

| Method | Stripe implementation |
|---|---|
| Multibanco | `stripe.paymentIntents.create` with `payment_method_types: ["multibanco"]` — returns entity/reference from `next_action.multibanco_display_details` |
| MB WAY | Stripe Checkout Session (card fallback) — MB WAY not natively supported by Stripe; user gets a Stripe-hosted payment page |
| Card | Stripe Checkout Session (`payment_method_types: ["card"]`) |

## Webhook

- Route: `POST /api/payments/stripe-webhook`
- **CRITICAL**: Registered BEFORE `express.json()` in `app.ts` so `req.body` is raw Buffer
- Handles `checkout.session.completed` and `payment_intent.succeeded`
- `creditPayment(orderId)` helper is inlined in `app.ts` (avoids circular import) and also in `payments.ts`

## Card return flow

- `GET /api/payments/card-return?status=success&orderId=...` — Stripe redirects here after checkout
- Credits balance via same `creditPayment()` function
- No anti-tampering key needed (Stripe checkout URLs are signed)

## Frontend

- `handleMbway()` opens `paymentUrl` in new tab (same as card flow)
- Header shows "Processado por Stripe" instead of "ifthenpay"
- Poll loop for MB WAY status still works (polls `/api/payments/status/:orderId`)
