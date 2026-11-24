-- Self-serve paid plans beside the original "founding" plan.
ALTER TYPE "entitlement_plan" ADD VALUE IF NOT EXISTS 'plus';
--> statement-breakpoint
ALTER TYPE "entitlement_plan" ADD VALUE IF NOT EXISTS 'pro';
--> statement-breakpoint
ALTER TYPE "entitlement_plan" ADD VALUE IF NOT EXISTS 'business';
