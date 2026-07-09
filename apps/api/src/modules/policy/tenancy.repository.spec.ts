import { TenancyRepository } from './tenancy.repository';
import { ActorContextService, actorContextStorage } from '../../events/actor-context.storage';
import { anonymousActor } from '../../events/actor-context';

describe('TenancyRepository (W1-E5-S2, dark)', () => {
  // enforcement deps are unused by the dark helpers under test
  const repo = new TenancyRepository(new ActorContextService(), {} as any, {} as any);

  it('injects the active org filter inside a request context', () => {
    actorContextStorage.run(
      { actor: { ...anonymousActor('t'), userId: 1, referenceType: 'admin', activeOrgId: 42 } },
      () => {
        expect(repo.orgFilter()).toEqual({ ownerOrganizationId: 42 });
        expect(repo.scopedProjectWhere({ isCompleted: false })).toEqual({
          isCompleted: false,
          ownerOrganizationId: 42,
        });
      },
    );
  });

  it('is a no-op without an active org (participants, system, outside requests)', () => {
    expect(repo.orgFilter()).toEqual({});
    actorContextStorage.run(
      { actor: { ...anonymousActor('t'), userId: 2, referenceType: 'participant', activeOrgId: null } },
      () => expect(repo.scopedProjectWhere({ a: 1 })).toEqual({ a: 1 }),
    );
  });
});
