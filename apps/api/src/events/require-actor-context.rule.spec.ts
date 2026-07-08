import { RuleTester } from 'eslint';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require('../../eslint-rules/require-actor-context');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
} as any);

// RuleTester integrates with jest by calling describe/it itself.
tester.run('require-actor-context', rule, {
      valid: [
        {
          name: 'mutating method with ActorContext first',
          filename: '/app/src/modules/projects/projects.service.ts',
          code: `class ProjectsService { async create(actor: ActorContext, dto: CreateDto) {} }`,
        },
        {
          name: 'read methods are exempt',
          filename: '/app/src/modules/projects/projects.service.ts',
          code: `class ProjectsService { async findAll(query: QueryDto) {} async getSummary(id: number) {} }`,
        },
        {
          name: 'private mutating methods inherit the actor from their entry point',
          filename: '/app/src/modules/payments/payments.service.ts',
          code: `class PaymentsService { private async completeDonation(id: string) {} }`,
        },
        {
          name: 'controllers are out of scope (they use @CurrentActor)',
          filename: '/app/src/modules/projects/projects.controller.ts',
          code: `class ProjectsController { create(dto: CreateDto) {} }`,
        },
        {
          name: 'event infrastructure is out of scope',
          filename: '/app/src/events/event-bus.service.ts',
          code: `class EventBusService { createBuffer() {} }`,
        },
        {
          name: 'spec files are out of scope',
          filename: '/app/src/modules/projects/projects.service.spec.ts',
          code: `class Whatever { create(x: number) {} }`,
        },
      ],
      invalid: [
        {
          name: 'mutating method without any params',
          filename: '/app/src/modules/projects/projects.service.ts',
          code: `class ProjectsService { async create() {} }`,
          errors: [{ messageId: 'missingActor' }],
        },
        {
          name: 'mutating method whose first param is not ActorContext',
          filename: '/app/src/modules/donations/donations.service.ts',
          code: `class DonationsService { async updateStatus(id: number, dto: UpdateDto) {} }`,
          errors: [{ messageId: 'missingActor' }],
        },
        {
          name: 'every mutating verb prefix is covered',
          filename: '/app/src/modules/study/study.service.ts',
          code: `class StudyService {
            async createX(a: number) {}
            async updateX(a: number) {}
            async deleteX(a: number) {}
            async removeX(a: number) {}
            async changeX(a: number) {}
            async cancelX(a: number) {}
            async approveX(a: number) {}
            async rejectX(a: number) {}
            async assignX(a: number) {}
            async castX(a: number) {}
            async toggleX(a: number) {}
            async uploadX(a: number) {}
            async submitX(a: number) {}
          }`,
          errors: Array(13).fill({ messageId: 'missingActor' }),
        },
      ],
});
