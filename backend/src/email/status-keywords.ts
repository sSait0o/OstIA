import { ApplicationStatus } from '../applications/entities/application.entity';

interface StatusRule {
  status: ApplicationStatus;
  pattern: RegExp;
}

const STATUS_RULES: StatusRule[] = [
  {
    status: ApplicationStatus.REJECTED,
    pattern:
      /\b(regrett?ons|n['’]avons (?:pas|malheureusement pas) retenu|ne (?:pouvons|donnerons) pas (?:donner suite|poursuivre)|malheureusement|réponse négative|candidature n['’]a pas été retenue|refus\w*|poste (?:a été )?pourvu|autre profil (?:a été|a été retenu)|unfortunately|not (?:been )?selected|not moving forward|regret to inform|rejected)\b/i,
  },
  {
    status: ApplicationStatus.OFFER,
    pattern:
      /\b(félicitations|avons le plaisir de vous (?:offrir|proposer|annoncer)|proposition d['’]embauche|votre embauche|contrat (?:ci-joint|en pièce jointe|de travail)|pleased to offer|job offer|welcome to the team|welcome aboard)\b/i,
  },
  {
    status: ApplicationStatus.TECHNICAL,
    pattern:
      /\b(test technique|coding test|test de code|étude de cas|technical assessment|hackerrank|codility|take-home|test en ligne|évaluation en ligne|test de recrutement)\b/i,
  },
  {
    status: ApplicationStatus.INTERVIEW,
    pattern:
      /\b(convocation|convoqu\w+|rendez-vous (?:téléphonique|visio)|call (?:rh|de découverte)|échanger avec vous|interview (?:invitation|request)|schedule (?:a|an) (?:call|interview))\b/i,
  },
  {
    status: ApplicationStatus.INTERVIEW,
    pattern:
      /\b(?:invit\w+|convi\w+|propos\w+|aimerions|souhaiterions|serions ravis|planifi\w+|programm\w+|organis\w+|fixer)\b[^.!?\n]{0,40}\bentretiens?\b/i,
  },
  {
    status: ApplicationStatus.ACKNOWLEDGED,
    pattern:
      /\b(bien reçu votre candidature|accusé de réception|nous avons bien reçu|candidature a (?:été|bien été) transmise|remercions d['’]avoir (?:posé votre candidature|postulé)|merci d['’]avoir postulé|application (?:has been )?received|thank you for applying|thank you for your application)\b/i,
  },
  {
    status: ApplicationStatus.APPLIED,
    pattern:
      /\b(candidature envoyée|votre candidature a (?:bien )?été envoyée|postulé avec succès|application (?:submitted|successfully sent))\b/i,
  },
];

export function detectStatusByKeywords(text: string): ApplicationStatus | null {
  for (const rule of STATUS_RULES) {
    if (rule.pattern.test(text)) return rule.status;
  }
  return null;
}
