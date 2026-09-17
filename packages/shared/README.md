# @cabina/shared

Package condiviso tra dashboard e widget. Contiene error codes, tipi business, schemi Zod e costanti di configurazione piani.

## Contenuto

### Error codes (`errors.ts`)

`ErrorCode` è un union type usato da tutte le API route del dashboard. La risposta API segue sempre la forma `ApiResponse<T>`:

```typescript
import { ApiResponse, ErrorCode } from '@cabina/shared'

// { data: T | null, error: { code: ErrorCode, message: string } | null }
```

Codici disponibili: `INVALID_API_KEY`, `RATE_LIMIT_EXCEEDED`, `UNAUTHORIZED`, `INTERNAL_ERROR`, `SESSION_LIMIT_REACHED`, `SIZE_TABLE_NOT_FOUND`, `RENDER_FAILED`, `INVALID_MEASURES`, `MERCHANT_NOT_CONFIGURED`, `CSV_*`, `PLAN_LIMIT_ALERT`, `INVALID_PLAN_CHANGE`, `STRIPE_WEBHOOK_INVALID`, `PAYMENT_FAILED`, `ALREADY_MAX_PLAN`

### Tipi business (`types.ts`)

```typescript
import {
  MerchantPlan,          // 'freemium' | 'starter' | 'growth' | 'pro'
  SubscriptionStatus,    // 'active' | 'past_due' | 'grace' | 'canceled'
  SupportedLanguage,     // 'it' | 'en' | 'fr' | 'es' | 'de'
  PLAN_SESSION_LIMITS,    // { freemium: 50, starter: 500, growth: 2000, pro: 4000 }
  PLAN_PRICES_EUR,        // { freemium: 0, starter: 34, growth: 79, pro: 119 }
  PLAN_GENERATIVE_LIMITS, // crediti Studio/mese: { freemium: 70, starter: 680, growth: 1500, pro: 2300 }
  PLAN_RANK,              // ordinamento piani per confronto upgrade/downgrade
  WidgetConfig,
  Measures,
  PlanStatus,
  BillingStatus,
  RenderPayload,
  RenderResult,
} from '@cabina/shared'
```

### Schemi Zod (`schemas.ts`)

Schemi di validazione runtime usati nelle API route. Importa da `@cabina/shared` per evitare duplicazioni tra dashboard e widget.

## Utilizzo

```typescript
// Nel dashboard (Next.js)
import { ErrorCode, MerchantPlan, PLAN_SESSION_LIMITS } from '@cabina/shared'

// Nel widget (Vite)
import { WidgetConfig, SupportedLanguage } from '@cabina/shared'
```

Il package viene transpilato a runtime da TypeScript path alias — non richiede build separato durante lo sviluppo.

## Script

```bash
npm run build    # tsc → dist/
npm run lint     # tsc --noEmit
npm run test     # vitest run (48 test)
```

## Note

- Aggiungere nuovi `ErrorCode` qui quando si creano nuove API route — mai definirli localmente nel dashboard o nel widget.
- `PLAN_SESSION_LIMITS`, `PLAN_PRICES_EUR` e `PLAN_GENERATIVE_LIMITS` (crediti Studio) sono la fonte di verità per limiti e prezzi — usarli nelle email, nella UI e nei calcoli billing. `STUDIO_CREDIT_COSTS` e `STUDIO_VIDEO_UNITS` sono il costo in crediti per operazione (1 credito ≈ $0.01 di costo reale fal.ai).
- Il tipo `database.types.ts` nel dashboard importa i tipi Supabase generati separatamente e non è parte di questo package.
