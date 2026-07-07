import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ActorContextInterceptor } from './actor-context.interceptor';
import { ActorContextService } from './actor-context.storage';
import { EventBusService } from './event-bus.service';

/**
 * Domain event infrastructure (W0-E2-S1/S2). Global so services can inject
 * EventBusService / ActorContextService without importing this module
 * everywhere. The ActorContext request pipeline is completed by
 * requestContextMiddleware, registered in app.setup.ts.
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // '.'-delimited wildcards let the audit module (W0-E3) subscribe to '**'.
      wildcard: true,
      delimiter: '.',
      // Bound the fan-out; raise deliberately if a legit 11th subscriber appears.
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
  ],
  providers: [
    EventBusService,
    ActorContextService,
    { provide: APP_INTERCEPTOR, useClass: ActorContextInterceptor },
  ],
  exports: [EventBusService, ActorContextService],
})
export class EventsModule {}
