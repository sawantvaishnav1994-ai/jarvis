import type { ConsumerAuthorizationPort, EventSubscription, JarvisEventEnvelope } from "@jarvis/events";
import { SecurityStateSchema } from "@jarvis/security";

export interface J08SecurityStatePort { read(): unknown; }
export type J08SubscriptionPolicy = (subscription:EventSubscription,event:JarvisEventEnvelope)=>Promise<boolean>;

/** Reuses authoritative J0.3 security state and policy. It never maintains a parallel emergency or permission model. */
export class J03EventConsumerAuthorization implements ConsumerAuthorizationPort{
  constructor(private state:J08SecurityStatePort,private policy:J08SubscriptionPolicy){}
  async authorize(subscription:EventSubscription,event:JarvisEventEnvelope){const security=SecurityStateSchema.parse(this.state.read());if(security.flags.includes("SECURITY_LOCKDOWN"))return false;if(security.frozenActors.includes(subscription.consumerId))return false;if(security.flags.includes("AGENTS_FROZEN")&&subscription.consumerType==="AGENT")return false;if(security.flags.includes("AUTONOMY_DISABLED")&&(subscription.consumerType==="AGENT"||subscription.consumerType==="WORKFLOW"))return false;return this.policy(subscription,event);}
}
