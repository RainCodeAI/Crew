/**
 * Redact operational PII before sending schedule context to OpenAI.
 * Default is privacy-preserving: ids + skills + times only.
 */

export type AiJobInput = {
  id: string;
  title: string;
  durationMinutes: number;
  requiredSkills: string[];
  requiredCertifications?: string[];
  priority: string;
  address?: string;
  preferredStartAt?: number;
  preferredEndAt?: number;
  serviceType?: string;
};

export type AiCrewInput = {
  id: string;
  name: string;
  skills: string[];
  certifications?: string[];
  hourlyRate?: number;
  isActive: boolean;
  roleLabel?: string;
};

export type AiUnavailable = {
  crewMemberId: string;
  startAt: number;
  endAt: number;
  reason?: string;
};

/**
 * @param allowPii when true, pass through customer/crew identifying fields.
 * when false (default), strip addresses, names, rates, free-text reasons.
 */
export function sanitizeJobsForAi(
  jobs: AiJobInput[],
  allowPii: boolean,
): AiJobInput[] {
  return jobs.map((j, i) => {
    if (allowPii) {
      return {
        id: j.id,
        title: j.title,
        durationMinutes: j.durationMinutes,
        requiredSkills: j.requiredSkills,
        requiredCertifications: j.requiredCertifications,
        priority: j.priority,
        address: j.address,
        preferredStartAt: j.preferredStartAt,
        preferredEndAt: j.preferredEndAt,
      };
    }
    return {
      id: j.id,
      title: j.serviceType
        ? `${j.serviceType} job ${i + 1}`
        : `Job ${i + 1}`,
      durationMinutes: j.durationMinutes,
      requiredSkills: j.requiredSkills,
      requiredCertifications: j.requiredCertifications,
      priority: j.priority,
      // no address
      preferredStartAt: j.preferredStartAt,
      preferredEndAt: j.preferredEndAt,
    };
  });
}

export function sanitizeCrewForAi(
  crew: AiCrewInput[],
  allowPii: boolean,
): AiCrewInput[] {
  return crew.map((c, i) => {
    if (allowPii) {
      return {
        id: c.id,
        name: c.name,
        skills: c.skills,
        certifications: c.certifications,
        hourlyRate: c.hourlyRate,
        isActive: c.isActive,
      };
    }
    return {
      id: c.id,
      name: c.roleLabel?.trim() || `Crew member ${i + 1}`,
      skills: c.skills,
      certifications: c.certifications,
      // no hourlyRate
      isActive: c.isActive,
    };
  });
}

export function sanitizeUnavailableForAi(
  blocks: AiUnavailable[],
  allowPii: boolean,
): AiUnavailable[] {
  return blocks.map((b) => ({
    crewMemberId: b.crewMemberId,
    startAt: b.startAt,
    endAt: b.endAt,
    reason: allowPii ? b.reason : undefined,
  }));
}
