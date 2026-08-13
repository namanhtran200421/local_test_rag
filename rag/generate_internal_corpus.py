#!/usr/bin/env python3
"""Generate Bob's realistic synthetic Cultural Infusion Atlas research corpus."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "corpus" / "manager"
SOURCE_URL = "https://atlas.culturalinfusion.com/secure-diversity-inclusion-survey-trust/"


def paragraphs(*values: str) -> list[str]:
    return [value.strip() for value in values]


DOCUMENTS = [
    {
        "slug": "atlas-secure-surveys-article",
        "title": "Secure Diversity and Inclusion Surveys Build Trust and Inclusion",
        "document_type": "Research article reconstruction",
        "topics": ["secure surveys", "trust", "privacy", "DEI", "anonymisation", "compliance"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Article record", paragraphs(
                "This synthetic reconstruction is based on the structure and themes of a Cultural Infusion Atlas research article published on 20 June 2025. The page identifies Rezza Moieni, Chief Technology Officer, as the author and describes the article as a nine-minute read. It links the discussion to a published paper titled Empirical Analysis of Data Privacy Concerns in DEI by Parisasadat Shojaei and Rezza Moieni.",
                "The central proposition is that privacy, anonymity and compliance are not peripheral technical features. They shape whether people trust a diversity and inclusion survey enough to participate honestly. The article treats information security as an organisational promise about how identity data will be collected, analysed, retained and used.",
            )),
            ("Sensitive questions demand serious safeguards", paragraphs(
                "Diversity surveys can ask about country of birth, ethnicity, language, gender identity, sexual orientation, disability, religion and other attributes. These questions may reveal deeply personal information and may fall within legally protected or specially regulated categories. A breach can create material harm even when the original survey was intended to improve inclusion.",
                "Two assurances are presented as prerequisites for candid participation. First, an individual's answers should not be traceable back to them in ordinary reporting. Second, data should be stored securely and used only for the stated purpose. If respondents doubt either assurance, participation can fall and answers can become incomplete or strategically cautious, weakening the validity of the resulting analysis.",
            )),
            ("Trust is a two-way street", paragraphs(
                "The article reports a relationship between robust privacy measures and stronger participation. It states that employees who trust how information will be handled are 2.5 times more likely to engage with diversity initiatives. In this test corpus, that number is retained as a claim made by the source article, not as an independently reproduced statistical result.",
                "Trust depends on more than a privacy notice. Respondents consider whether managers can view small groups, whether free-text comments can identify them, whether data might appear in performance decisions, and whether future uses could exceed the consent originally given. A secure survey therefore requires technical controls, clear governance and credible communication.",
            )),
            ("Privacy-first technology", paragraphs(
                "Anonymisation and data minimisation reduce the amount of identifying information collected and remove or transform details that could enable re-identification. Differential privacy introduces calibrated noise into aggregate results. Homomorphic encryption and secure multi-party computation can permit analysis while information remains protected. Federated learning can train models across separated systems without centralising raw records.",
                "Each technique solves a different problem. Encryption protects data in transit and at rest but does not prevent an authorised analyst from isolating a very small group. Aggregation thresholds reduce small-cell disclosure but can hide intersectional experiences. Differential privacy limits inference from published statistics but requires a carefully managed privacy budget. Technology selection must follow the actual threat model rather than a checklist of fashionable controls.",
            )),
            ("Compliance is not optional", paragraphs(
                "The article surveys a global patchwork of privacy rules, including the European Union GDPR, California CPRA, Brazil LGPD, Australia's Privacy Act, the United Kingdom Data Protection Act, Canada's PIPEDA, Singapore PDPA, Japan's personal information law, South Korea PIPA, South Africa POPIA, China's PIPL, New Zealand's Privacy Act, FERPA and HIPAA in relevant United States contexts.",
                "The regulatory table is directional rather than legal advice. Applicability changes with location, sector, employment relationship, type of information and processing purpose. Some regimes treat racial or sexual-orientation data as a special category; some require explicit consent or impose restrictions on cross-border transfers. A deployment should document jurisdiction-specific advice instead of assuming that one global configuration is sufficient.",
            )),
            ("Practical actions", paragraphs(
                "The source recommends selecting tools that explain anonymisation and encryption; clearly telling respondents how data will be used, stored and accessed; collecting only information connected to an inclusion objective; training human resources and diversity leads; and reviewing practices as laws and expectations change.",
                "For a realistic implementation, these actions translate into a data inventory, purpose register, respondent notice, access matrix, aggregation rules, retention schedule, deletion workflow, incident plan and periodic assurance review. Configuration should be tested with small and intersectional cohorts before launch because a report can be technically aggregated yet still allow colleagues to infer an identity from context.",
            )),
            ("Well-Architected security", paragraphs(
                "The article references the AWS Well-Architected Framework as a way to assess secure, reliable, efficient and resilient infrastructure. A review can examine identity and access management, audit logging, encryption, backup recovery, vulnerability management, monitoring and incident response. The existence of a review does not replace ongoing operational evidence.",
                "A strong survey platform joins infrastructure assurance with product-level privacy. Cloud controls may protect a database while poor report filters expose a subgroup. Conversely, careful aggregation cannot compensate for weak administrator access or unmanaged exports. Both layers should be evaluated together.",
            )),
            ("Conclusion", paragraphs(
                "The article concludes that a secure survey is a promise to protect identity and safety. When people trust that promise, they are more willing to speak openly; more candid participation can help organisations identify exclusion and improve practice. Privacy is therefore framed as part of inclusion rather than an obstacle to measurement.",
                "For retrieval evaluation, Bob should be able to distinguish the article's claims from this document's explanatory expansions, identify the named privacy technologies, retrieve the regulatory examples, and explain why survey security affects both ethics and data quality.",
            )),
        ],
    },
    {
        "slug": "atlas-empirical-privacy-paper",
        "title": "Empirical Analysis of Data Privacy Concerns in DEI - Synthetic Extended Paper",
        "document_type": "Academic-style research paper",
        "topics": ["empirical research", "privacy concerns", "participation", "survey experiment", "DEI"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Abstract", paragraphs(
                "This synthetic paper models how privacy concern, perceived anonymity and institutional trust may influence participation in workforce diversity surveys. A fictional multi-site study of 4,260 invited employees compares four survey introductions: a basic notice, a detailed purpose notice, a technical-security notice, and a combined privacy-and-governance notice. The constructed results are intentionally plausible test data and are not findings from the linked published paper.",
                "In the fictional dataset, the combined notice produces the highest completion rate at 71 percent, compared with 48 percent for the basic notice. Perceived anonymity mediates part of the association, but local manager behaviour and prior organisational trust remain strong predictors. The exercise demonstrates why retrieval must preserve qualifiers: a notice improves conditions but does not manufacture trust where workplace practice contradicts it.",
            )),
            ("Research questions and hypotheses", paragraphs(
                "RQ1 asks whether a clear explanation of purpose and access improves survey completion. RQ2 asks whether technical descriptions improve confidence or overwhelm respondents. RQ3 examines whether employees from small demographic groups perceive greater re-identification risk. RQ4 considers how prior experience with organisational confidentiality changes the effect of survey messaging.",
                "The synthetic hypotheses predict that combined governance and security information will outperform a basic notice; that technical detail without plain-language explanation will have mixed effects; that small-cohort respondents will report more disclosure concern; and that trust established before the survey will moderate every intervention.",
            )),
            ("Design and sample", paragraphs(
                "The fictional study includes 12 organisations across Australia, Canada, Singapore and the United Kingdom. Invitations are stratified by organisation size and employment type. The sample deliberately oversamples remote workers and employees in business units with fewer than 30 people to examine contextual re-identification. Participation is voluntary, and simulated individual records contain no real personal data.",
                "The primary outcome is completion of the survey. Secondary outcomes are perceived anonymity, clarity of purpose, confidence in data handling, item non-response and willingness to participate again. The design pre-registers exclusion rules and distinguishes an invitation-level analysis from a completer-only analysis to reduce survivorship bias.",
            )),
            ("Constructed results", paragraphs(
                "Basic notice: 48 percent completion, mean anonymity confidence 3.1 out of 7, and 19 percent item non-response on sensitive questions. Detailed purpose notice: 59 percent completion, confidence 4.2, and 14 percent item non-response. Technical-security notice: 57 percent completion, confidence 4.5, and 16 percent item non-response. Combined notice: 71 percent completion, confidence 5.6, and 9 percent item non-response.",
                "The difference between the combined and basic conditions is substantial in this fabricated example, but it should not be reported as a universal causal estimate. Effects vary by organisation. In two fictional sites with recent confidentiality disputes, completion remains below 45 percent in every condition. The pattern supports the interpretation that communication can reinforce trustworthy practice but cannot substitute for it.",
            )),
            ("Small-cohort and intersectional risk", paragraphs(
                "Participants in teams below ten people express greater concern about being inferred from combinations such as location, role, age band and cultural background. Suppressing a single rare category is not always enough because several common fields can become identifying when combined. The study therefore evaluates k-anonymity style thresholds at the report-query level rather than only during initial de-identification.",
                "A fictional threshold of eight is used for standard dashboard views, with a threshold of twelve for high-sensitivity intersectional views. These numbers are test fixtures, not recommended defaults. Threshold selection should reflect workforce structure, plausible attacker knowledge, reporting purpose and the consequences of mistaken disclosure.",
            )),
            ("Statistical interpretation", paragraphs(
                "The analysis reports confidence intervals and effect heterogeneity rather than a single headline percentage. Missing responses are not assumed to be random. Sensitivity analysis explores whether employees with the greatest privacy concern are least likely to complete, which could cause ordinary respondent-only results to understate concern.",
                "A mediation model suggests that perceived anonymity explains some of the completion difference, while clarity and institutional trust contribute independently. Because every measure is self-reported in this synthetic example, common-method bias is possible. Longitudinal evidence and behavioural audit data would strengthen the design.",
            )),
            ("Ethical and legal considerations", paragraphs(
                "Consent must be freely given and meaningful. In an employment context, the power relationship can complicate voluntariness even when a survey is formally optional. Notices should make consequences of non-participation explicit, avoid pressure through manager tracking, and provide a channel for privacy questions independent of direct supervision.",
                "The study design separates research analysis from operational reporting, applies role-based access and logs exports. Free-text comments receive additional screening because narrative detail can reveal identity more readily than coded variables. Retention is linked to stated analytical purposes, with deletion or irreversible aggregation after the approved period.",
            )),
            ("Limitations and reproducibility", paragraphs(
                "All numeric results in this document are fabricated for RAG evaluation. The sample, organisations and effect sizes do not describe Cultural Infusion clients or employees. The document intentionally resembles a research paper so tests can ask about study design, subgroup findings, limitations and the distinction between source claims and synthetic extensions.",
                "A reproducible real study would publish a protocol, variable dictionary, analysis code, disclosure-control approach and a privacy-preserving data-access process. Raw sensitive identity records should not be released merely in the name of open science. Reproducibility must be balanced with participant protection.",
            )),
        ],
    },
    {
        "slug": "atlas-global-privacy-regulatory-matrix",
        "title": "Global Privacy and Diversity Survey Regulatory Matrix",
        "document_type": "Regulatory research briefing",
        "topics": ["GDPR", "Privacy Act", "CPRA", "LGPD", "PIPL", "PDPA", "regulatory matrix"],
        "source_url": SOURCE_URL,
        "sections": [
            ("How to use this matrix", paragraphs(
                "This synthetic briefing expands the jurisdictions named in the source article into a retrieval-heavy comparison. It is an educational test fixture, not legal advice. A law's relevance depends on controller and processor roles, location, industry, employee relationship, data type, collection method and cross-border flows.",
                "The matrix should be queried by obligation rather than treated as a universal checklist. Useful questions include whether explicit consent is required, whether identity attributes receive heightened protection, how access and deletion requests are handled, whether a local representative is needed, and what transfer mechanism supports offshore processing.",
            )),
            ("European Union - GDPR", paragraphs(
                "The General Data Protection Regulation treats data revealing racial or ethnic origin, political opinions, religious beliefs, health, sex life and sexual orientation as special categories. Processing requires both an Article 6 legal basis and an Article 9 condition. Employment consent can be problematic where the power imbalance means it is not freely given.",
                "A diversity survey may require a data protection impact assessment when processing is likely to create high risk. Controllers should apply purpose limitation, minimisation, privacy by design, security, retention controls, data-subject rights and appropriate safeguards for international transfers. Aggregated reporting does not remove duties applied during collection and processing.",
            )),
            ("Australia - Privacy Act", paragraphs(
                "The Australian Privacy Act regulates handling of personal information by covered entities through the Australian Privacy Principles. Information about racial or ethnic origin, political opinions, religious beliefs, sexual orientation, health and some other attributes can be sensitive information. Consent and necessity are central considerations for collection.",
                "A deployment should also consider employee-record exemptions, state and territory requirements, breach notification, offshore disclosure and contractual commitments. The source article also names Australia's Consumer Data Right, although its applicability should be analysed separately rather than assumed for every workforce survey.",
            )),
            ("United States - sectoral and state rules", paragraphs(
                "The article references FERPA for education records, HIPAA for protected health information in covered contexts, and California's CPRA as an extension of the CCPA framework. The United States lacks one general federal privacy law equivalent to GDPR, so applicability can depend on sector, state, employer size, data source and use.",
                "A survey used in an educational institution may intersect with FERPA when results become part of student education records. HIPAA is not a general employment privacy statute and should not be cited merely because a survey asks about disability. California requirements can include notices, rights handling, contractual controls and limits on use of sensitive personal information.",
            )),
            ("Brazil, Canada and the United Kingdom", paragraphs(
                "Brazil's LGPD establishes legal bases, data-subject rights, security expectations and special treatment for sensitive personal data. Canada's PIPEDA governs personal information in commercial activities at the federal level, alongside provincial laws. The United Kingdom Data Protection Act complements the UK GDPR and includes national provisions that differ from the European Union regime.",
                "For a global survey, a single English-language notice may fail if it obscures local rights or the responsible entity. A layered notice can provide a consistent core explanation plus jurisdiction-specific sections covering contacts, legal bases, complaint routes and transfers.",
            )),
            ("Asia-Pacific regimes", paragraphs(
                "Singapore's PDPA addresses collection, use, disclosure, protection and care of personal data. Japan's APPI governs handling of personal information and cross-border transfers. South Korea's PIPA is often described as a comprehensive privacy regime with detailed consent and security requirements. China's PIPL includes strict rules for personal information and cross-border processing.",
                "New Zealand's Privacy Act establishes information privacy principles and breach obligations. Regional terms such as sensitive information, consent and anonymisation are not perfectly interchangeable. Data localisation and transfer assessments should be confirmed for the actual architecture and participating workforce.",
            )),
            ("South Africa - POPIA", paragraphs(
                "The Protection of Personal Information Act regulates processing by public and private bodies and recognises special personal information. Responsible parties should justify processing, collect information for a specific purpose, maintain quality, safeguard records and enable participation rights.",
                "A survey spanning South African and European workforces may be able to reuse some governance controls, but legal terminology, regulator expectations and transfer mechanisms still require jurisdiction-aware implementation.",
            )),
            ("Conflict-resolution scenario", paragraphs(
                "Project Lantern is a fictional survey hosted in Australia for respondents in six regions. The global template proposes five-year raw-data retention, manager-level dashboards and optional free text. The European assessment limits identifiable retention to eighteen months; the Canadian team requests bilingual notices; the Singapore review adds a transfer explanation; and the small New Zealand office cannot support manager dashboards without disclosure risk.",
                "The resolution is not to pick the least restrictive rule. The synthetic design uses a stricter global baseline where feasible, local notice modules, regional retention overrides, dashboard suppression below approved thresholds and a documented review of cross-border vendors. Exceptions require named ownership and evidence.",
            )),
        ],
    },
    {
        "slug": "atlas-privacy-preserving-technology-guide",
        "title": "Privacy-Preserving Technologies for Diversity Analytics",
        "document_type": "Technical architecture guide",
        "topics": ["differential privacy", "homomorphic encryption", "federated learning", "SMPC", "anonymisation"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Threat model", paragraphs(
                "A privacy architecture begins with plausible threats: an external attacker steals a database; an administrator exports raw responses; a manager isolates a small team through filters; a colleague recognises a free-text event; or repeated aggregate queries reveal an individual's contribution. Encryption alone addresses only part of this set.",
                "The protected assets include identity attributes, survey answers, authentication records, organisation structure, free text, report exports, query history and cryptographic keys. Adversaries can possess auxiliary knowledge such as a person's team, location or public identity. Controls should be assessed against those combinations.",
            )),
            ("Data minimisation and pseudonymisation", paragraphs(
                "Minimisation removes fields that do not support a documented objective and limits precision where exact values are unnecessary. Pseudonymisation replaces direct identifiers with controlled references so operational workflows can be separated from analysis. It reduces exposure but remains personal-data processing when re-linking is possible.",
                "A synthetic survey stores invitation delivery in one service and responses in another. The analysis dataset uses a rotating participant token. The token mapping is deleted after reminder periods close. This design reduces routine linkage but does not claim irreversible anonymisation while contextual attributes remain.",
            )),
            ("Aggregation and small-cell suppression", paragraphs(
                "Aggregation restricts reports to groups rather than individuals. Small-cell suppression hides results below a defined threshold and may also suppress complementary cells so totals do not reveal the missing value. Query controls must account for differencing attacks in which two overlapping reports isolate a person.",
                "The fictional Atlas dashboard starts with a threshold of ten for general results and fifteen for high-sensitivity cross-tabs. An audit finds that repeated filters can still infer a group of two, so the revised design tracks query sets and applies a contribution rule. Thresholds are examples for testing, not production recommendations.",
            )),
            ("Differential privacy", paragraphs(
                "Differential privacy bounds how much a published result can change when one person's record is added or removed. A mechanism adds calibrated randomness according to sensitivity and a privacy parameter commonly called epsilon. Smaller epsilon generally means stronger privacy and lower accuracy.",
                "A privacy budget limits cumulative disclosure across repeated releases. Product teams must decide which queries consume budget, how to communicate uncertainty and what happens when the budget is exhausted. Differential privacy is not a magic anonymisation label; poor clipping, unlimited exports or leakage through non-private features can invalidate the protection.",
            )),
            ("Homomorphic encryption and secure multi-party computation", paragraphs(
                "Homomorphic encryption supports selected computations over encrypted values without exposing plaintext to the computing service. Secure multi-party computation lets parties jointly compute an output while keeping their inputs separate. Both can reduce trust placed in a central processor but introduce performance, implementation and key-management complexity.",
                "A fictional consortium uses secure aggregation to combine inclusion indicators across member organisations without sharing employee-level records. The protocol reveals only totals above a publication threshold. Governance still matters because a malicious participant can submit manipulated inputs or infer information when the consortium is too small.",
            )),
            ("Federated learning", paragraphs(
                "Federated learning trains a shared model across separated data stores. Participants exchange model updates rather than raw records. Updates can nevertheless leak information, so secure aggregation, clipping, differential privacy and participant authentication may be required.",
                "For many diversity-survey tasks, ordinary aggregated statistics may be more transparent and proportionate than federated machine learning. The architecture should choose the simplest approach that meets the analytical goal and threat model.",
            )),
            ("Encryption and key management", paragraphs(
                "Transport encryption protects network paths, while storage encryption protects media and backups. Application-layer encryption can reduce exposure to infrastructure administrators. Key rotation, separation of duties, recovery testing, hardware-backed storage and access logging are essential supporting controls.",
                "Encryption does not decide whether an analyst should see a record. Authorisation, report design, export controls and monitoring remain necessary. A platform should be tested for indirect paths such as logs, caches, support tools and analytics telemetry.",
            )),
            ("Technology selection record", paragraphs(
                "The synthetic decision record selects minimisation, pseudonymisation, role-based access, aggregation thresholds, monitored query controls and encryption as baseline measures. Differential privacy is reserved for external benchmark releases. Homomorphic encryption and federated learning are evaluated but not adopted because the use case does not justify their operational complexity.",
                "Bob should retrieve this decision when asked which advanced techniques were rejected, while separately explaining that the source article lists them as emerging options. That distinction tests whether generation respects document context instead of combining every retrieved technology into one recommendation.",
            )),
        ],
    },
    {
        "slug": "atlas-trust-participation-evidence-review",
        "title": "Trust, Participation and Response Reliability - Evidence Review",
        "document_type": "Evidence synthesis",
        "topics": ["trust", "participation rate", "response bias", "honesty", "reliability"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Review question", paragraphs(
                "This synthetic evidence review asks how privacy expectations influence whether employees start, complete and answer diversity surveys candidly. It separates participation rate from response reliability: a high response rate can coexist with strategic answers, while a smaller trusted sample can still be biased if non-participants differ systematically.",
                "The source article states that trusted information handling is associated with greater engagement and reports a 2.5-times figure. The present review treats that as a source claim and explores mechanisms and alternative explanations rather than presenting it as a replicated universal effect.",
            )),
            ("Mechanisms of trust", paragraphs(
                "Procedural clarity helps respondents understand why questions are asked. Technical confidence addresses storage, transmission and access. Institutional trust reflects prior experience with leadership and confidentiality. Interpersonal safety concerns whether managers or colleagues might retaliate or infer identity. These dimensions can move independently.",
                "A detailed encryption statement may raise technical confidence but do little for interpersonal safety if the dashboard reports teams of three. Conversely, a trusted leader's endorsement may increase participation while leaving weak back-end controls undetected. Evidence should therefore examine both perceptions and actual safeguards.",
            )),
            ("Non-response and measurement error", paragraphs(
                "People with high privacy concern may skip a survey or omit selected items. If privacy concern correlates with demographic identity or negative workplace experience, resulting metrics can systematically underrepresent the people the survey seeks to understand. Weighting can address known differences but cannot fully correct unobserved distrust.",
                "Measurement error also occurs when respondents choose broad categories to avoid identification, select prefer-not-to-say, or provide socially desirable answers. These behaviours are informative signals about survey conditions, not merely dirty data to be removed.",
            )),
            ("Evidence hierarchy", paragraphs(
                "Stronger evidence might include randomised notice experiments, longitudinal changes after governance improvements, independent security assurance, completion metadata, item-level missingness and qualitative interviews. Simple before-and-after comparisons are vulnerable to staffing changes, campaign effects and broader shifts in organisational confidence.",
                "Case studies help explain context but should not be generalised without care. Vendor platform metrics may cover large samples yet suffer selection and reporting bias. Academic studies can offer transparent methods but may not reproduce the exact employment setting or legal environment.",
            )),
            ("Contradictory findings", paragraphs(
                "The fictional River Study finds that a long technical notice reduces completion among respondents with low digital confidence, even though it increases perceived security among specialists. The Harbour Study finds no completion change after an encryption campaign because employees remain concerned about local report access. The Valley Study finds that a short plain-language notice plus an independent contact improves both completion and item response.",
                "These constructed conflicts are intentional. Bob should not answer that more security detail always raises participation. The supported synthesis is that credible safeguards and understandable communication tend to support trust, but effects depend on baseline confidence, usability, governance and local context.",
            )),
            ("Interpreting the 2.5-times statement", paragraphs(
                "A relative statement requires a baseline. If 20 percent of a low-trust group engages, 2.5 times would be 50 percent; if 40 percent engages, a literal multiplication would exceed the possible range. The underlying outcome, model and adjustment variables matter. The article's phrasing is best reported with attribution and without inventing confidence intervals.",
                "For a production knowledge base, the linked paper should be ingested and the exact statistic mapped to its table, population and definition. Until then, Bob should say that the Atlas article reports the figure and avoid presenting it as independently verified by this synthetic corpus.",
            )),
            ("Practical measurement plan", paragraphs(
                "A survey team can measure invitation delivery, starts, completion, dropout location, sensitive-item non-response, prefer-not-to-say use, time to complete and willingness to participate again. Privacy-preserving qualitative feedback can explore why respondents abstained without pressuring them to disclose identity.",
                "Success criteria should include safety and legitimacy, not only response volume. A target that rewards managers purely for completion can create coercion and undermine voluntariness. Governance metrics can include access reviews, deletion timeliness, incident closure and the proportion of published views meeting disclosure thresholds.",
            )),
        ],
    },
    {
        "slug": "atlas-well-architected-survey-security",
        "title": "Well-Architected Review for a Secure Diversity Survey Platform",
        "document_type": "Security architecture review",
        "topics": ["AWS", "Well-Architected", "security", "reliability", "incident response", "survey platform"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Review scope", paragraphs(
                "This fictional review examines a multi-tenant diversity survey service from invitation through deletion. It includes the public survey application, identity separation, API, encrypted response store, reporting service, administrative portal, audit pipeline, backups, support access and third-party email delivery.",
                "The review is inspired by the Atlas article's discussion of the AWS Well-Architected Framework. Findings and architecture names are invented. A completed review is a point-in-time assessment, not a certification or guarantee that every control operates continuously.",
            )),
            ("Security pillar", paragraphs(
                "Strengths include centralised identity, least-privilege service roles, encryption, immutable administrative audit events, protected secrets and automated dependency scanning. High-risk findings include support engineers retaining broad production access, report exports lacking expiry, and insufficient monitoring of repeated small-cohort queries.",
                "The remediation plan introduces just-in-time support access with approval, expiring signed export links, customer-controlled report permissions and alerts for disclosure-risk query patterns. Key use and export events are routed to a security monitoring account separated from the application environment.",
            )),
            ("Reliability pillar", paragraphs(
                "Survey windows can coincide with organisation-wide campaigns, producing sharp invitation and submission peaks. The fictional architecture uses queue-based ingestion, idempotent writes, rate limits and multi-zone databases. Restore tests target a recovery point of fifteen minutes and recovery time of four hours for core response data.",
                "Reliability must not weaken privacy. Failed submissions should not be copied into verbose logs, dead-letter queues should have the same access controls as the primary store, and support diagnostics should use synthetic records whenever possible.",
            )),
            ("Operational excellence", paragraphs(
                "Runbooks cover survey launch, access provisioning, suspected disclosure, deletion request, key rotation, failed export and client offboarding. Changes to aggregation logic require code review, automated privacy regression tests and approval by both analytics and security owners.",
                "Operational metrics include failed authentication, elevated access duration, export volume, deletion backlog, suppressed-query frequency, backup restore success and time to acknowledge security alerts. Raw survey answers are excluded from routine logs.",
            )),
            ("Performance and cost", paragraphs(
                "Caching can improve dashboard response time but creates another location where sensitive aggregates may persist. Cache keys include tenant and permission context, entries expire quickly, and private responses are never shared across tenants. Performance tests include worst-case cross-tabs under disclosure controls.",
                "Cost optimisation considers storage tiers and retention without keeping raw records merely because storage is cheap. Data lifecycle policies follow the approved purpose and retention schedule. Cost pressure is not accepted as a reason to reduce logging or recovery evidence.",
            )),
            ("Threat scenarios", paragraphs(
                "Scenario One: a stolen administrator session attempts bulk export. Conditional access, short sessions, step-up authentication and anomaly detection limit the action. Scenario Two: an authorised analyst uses filters to isolate one employee. Query controls, minimum cohorts and audit review reduce inference. Scenario Three: a client requests restoration after deletion. Backup handling must honour documented deletion and retention commitments.",
                "Scenario Four: a malicious survey prompt asks respondents to include names in free text. Template review, field warnings, moderation rules and client training reduce collection of unnecessary identifiers. Scenario Five: a vendor outage delays invitations but does not justify bypassing privacy controls.",
            )),
            ("Priority findings", paragraphs(
                "Priority P1 is removal of standing support access within thirty days. P2 is deployment of query-pattern monitoring within sixty days. P3 is automated export expiry within forty-five days. P4 is quarterly restore and deletion verification. Dates and priorities are synthetic test facts intended to test exact retrieval.",
                "Residual risk remains in contextual re-identification and client-side handling after a valid export. Contracts, product design, training and watermarking can reduce but not eliminate that risk. The platform should state the boundary clearly.",
            )),
        ],
    },
    {
        "slug": "atlas-survey-governance-playbook",
        "title": "Diversity Survey Governance and Incident Response Playbook",
        "document_type": "Operational governance manual",
        "topics": ["governance", "retention", "access control", "incident response", "consent", "free text"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Governance roles", paragraphs(
                "The fictional survey owner defines purpose and approved questions. The privacy lead reviews legal basis, notice, minimisation, rights and retention. The security lead owns technical safeguards and incident coordination. The people analytics lead validates measures and disclosure controls. Local representatives confirm jurisdiction and workforce context.",
                "No single role can approve every stage. Launch requires recorded sign-off from the survey owner, privacy lead and analytics lead. High-risk free text or cross-border changes also require security review. Bob may explain these roles but must not claim to perform an approval.",
            )),
            ("Purpose and question review", paragraphs(
                "Every question maps to an analytical purpose and proposed decision. Questions retained merely because they may be useful later are removed. Category design is reviewed for cultural relevance, respondent self-description, comparability and the risk that a category is too granular for the workforce size.",
                "Optional questions are labelled clearly. Prefer-not-to-say remains available where appropriate and is analysed as a response rather than silently discarded. Survey owners document which decisions will not be made from the data, including individual performance and hiring decisions.",
            )),
            ("Access matrix", paragraphs(
                "Respondents can view the notice and their submission confirmation but not other responses. Client administrators manage campaigns but cannot open row-level identity data. Approved analysts access de-identified datasets in a controlled environment. Executives receive thresholded aggregates. Support access is time-bound and ticket-linked.",
                "The synthetic matrix denies line managers any special visibility into their team's raw answers. A minimum group threshold applies even if a manager claims to know every team member. Emergency access requires two-person approval and generates an immutable alert.",
            )),
            ("Retention and deletion", paragraphs(
                "Invitation contact data is retained for ninety days after campaign closure. Pseudonym mappings are retained for one hundred and twenty days to support verified correction and deletion requests. De-identified response data is retained for twenty-four months. Aggregate benchmark statistics may be retained longer only if the approved method prevents re-identification.",
                "These periods are fictional defaults and can be shortened by contract or jurisdiction. Deletion covers primary stores, derived datasets, caches and scheduled backup expiry. Completion is evidenced through a deletion job record rather than a manual assurance alone.",
            )),
            ("Incident classification", paragraphs(
                "SEV-1 covers confirmed unauthorised access to raw sensitive responses or credible risk of widespread harm. SEV-2 covers a limited disclosure, compromised privileged account or export sent to the wrong authorised organisation contact. SEV-3 covers blocked attempts, policy deviations without exposure, or delayed deletion with low immediate harm.",
                "Classification can rise as facts change. The incident commander preserves evidence, contains access, consults privacy and legal specialists, evaluates notification duties, communicates with affected clients and records corrective actions. Public statements should distinguish known facts from investigation hypotheses.",
            )),
            ("Small-cohort disclosure scenario", paragraphs(
                "A client creates a filter combining regional office, seniority and language and receives a chart representing four people despite a configured threshold of ten. The incident team disables the filter path, preserves query logs, checks whether an export occurred and tests related combinations. The cause is a caching rule that applied the threshold before, rather than after, a secondary filter.",
                "The event is classified SEV-2 because an authorised client user could infer a small cohort. Remediation clears affected caches, patches query planning, adds privacy regression cases and notifies the client under the agreed process. No claim is made that a named individual was identified without supporting evidence.",
            )),
            ("Free-text scenario", paragraphs(
                "A respondent writes a detailed account containing colleague names and a medical condition. Automated detection quarantines the comment from ordinary analytics. A restricted reviewer removes unnecessary identifiers and records the reason. The original follows a short protected retention path required for incident assessment.",
                "Free text should not be treated like another category field. It needs clear respondent guidance, collection justification, access restrictions, redaction, moderation and a plan for urgent safeguarding content. Removing free text entirely may reduce insight, but collecting it without controls transfers risk to respondents.",
            )),
            ("Assurance schedule", paragraphs(
                "Monthly checks cover privileged access and deletion queues. Quarterly checks cover restore tests, threshold bypass attempts and vendor access. Annual review covers purpose, categories, jurisdiction changes, threat model and incident exercises. A material architecture or use change triggers an out-of-cycle review.",
                "Evidence is stored as dates, owners, test results, exceptions and remediation status. A policy document without operating evidence is not considered assurance.",
            )),
        ],
    },
    {
        "slug": "atlas-visual-evidence-companion",
        "title": "Visual Evidence Companion - Images, Charts and Accessible Descriptions",
        "document_type": "Media interpretation guide",
        "topics": ["images", "charts", "alt text", "accessibility", "trust", "regulatory table"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Purpose", paragraphs(
                "The source article contains several images and a regulatory table. Some image elements expose descriptive alternative text, while others use only the generic word Image. This synthetic companion provides explicit descriptions so Bob can answer questions about visual content when pixels are not available to the text-only ingestion pipeline.",
                "Descriptions separate observable content from interpretation. They identify chart encodings, labels, relationships and caveats. They do not infer ethnicity, disability, gender or other identity traits from appearance.",
            )),
            ("Hero image description", paragraphs(
                "Synthetic visual A is a wide editorial banner titled Why a Secure Diversity and Inclusion Survey is the Backbone of Trust and True Inclusion. It shows an abstract shield surrounding small coloured profile symbols connected to a survey form. A lock icon sits at the centre. The composition uses dark teal, coral and gold on a light background.",
                "The image communicates protection around personal responses. It is illustrative, not evidence that a specific technical control exists. The title should not be read as a guarantee that any survey using a lock icon is secure.",
            )),
            ("Trust and reliability diagram", paragraphs(
                "Synthetic visual B is a left-to-right flow diagram with four nodes: Privacy safeguards, Perceived trust, More candid participation, and More reliable organisational insight. Solid arrows show the article's proposed pathway. A dotted arrow from Prior organisational behaviour points to Perceived trust, indicating that technical safeguards operate within an existing trust context.",
                "The caption reads Trust enhances participant honesty and response reliability. The diagram is conceptual and does not establish an effect size. It helps explain the mechanism described in the article.",
            )),
            ("Participation chart", paragraphs(
                "Synthetic visual C is a grouped bar chart derived from the fictional extended paper. Completion rates are 48 percent for Basic notice, 59 percent for Purpose notice, 57 percent for Technical notice and 71 percent for Combined notice. A second series shows sensitive-item completion of 81, 86, 84 and 91 percent respectively.",
                "The vertical axis runs from zero to one hundred percent. Bars use accessible patterns as well as colour. A note states that values are fabricated for retrieval testing and must not be attributed to real Cultural Infusion customers or the linked academic paper.",
            )),
            ("Regulatory world map", paragraphs(
                "Synthetic visual D is a world map marking the jurisdictions discussed in the article: European Union, United Kingdom, Australia, New Zealand, Brazil, Canada, United States, California, China, Japan, South Korea, Singapore and South Africa. Regions are grouped by the briefing's research workflow, not ranked by privacy strength.",
                "The map avoids a red-to-green compliance scale because legal regimes cannot be reduced responsibly to a single good-or-bad score. Selecting a region would reveal the named law, scope note, sensitive-data issue and a reminder to obtain current advice.",
            )),
            ("Regulatory table description", paragraphs(
                "The source article presents a table with columns for reference, regulatory name, region and scope. Rows include FERPA, Australia's Privacy Act, HIPAA, PIPEDA, Japan's personal information law, South Korea PIPA, Singapore PDPA, South Africa POPIA, GDPR, Australia's Consumer Data Right, Brazil LGPD, the UK Data Protection Act, California CPRA, New Zealand's Privacy Act and China PIPL.",
                "A screen-reader-friendly version should preserve row and column associations. On narrow screens, each row can become a labelled card rather than a horizontally scrolling block with ambiguous relationships.",
            )),
            ("Architecture image", paragraphs(
                "Synthetic visual E shows survey responses entering an encrypted service, separating invitation identity from response content, then flowing to a thresholded analytics layer. Administrators access configuration through a different path. Audit logs flow to a protected monitoring account. Exports carry expiry and watermark controls.",
                "The image illustrates defence in depth. It does not depict differential privacy, homomorphic encryption or federated learning as deployed components. Those technologies are evaluated in the technical guide, while the fictional decision record adopts simpler baseline controls.",
            )),
            ("Image ingestion rules", paragraphs(
                "When crawling a real page, retain the source URL, image URL, nearby heading, figure caption, alt text, width and height. Generic alt text such as Image is not a useful description. A vision-generated caption should be labelled as generated and should avoid inferring sensitive attributes.",
                "OCR is useful for text embedded in charts but should be checked against the visual layout. A chart description should include title, axes, units, series, key values, direction, uncertainty and any synthetic-data warning. Decorative images can be recorded without consuming retrieval context.",
            )),
        ],
    },
    {
        "slug": "atlas-research-methodology-source-notes",
        "title": "Research Methodology, Source Notes and Claim Register",
        "document_type": "Methodology and provenance appendix",
        "topics": ["methodology", "provenance", "claims", "citations", "limitations", "source quality"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Corpus purpose", paragraphs(
                "This corpus mimics a heterogeneous research library for evaluating retrieval-augmented generation. It includes an article reconstruction, synthetic academic paper, legal briefing, technical guide, evidence review, architecture review, operational playbook and visual companion. Documents intentionally overlap while preserving different scopes and levels of authority.",
                "The only supplied real-world source for this expansion is the public Atlas article URL. Text in these PDFs is paraphrased, expanded or fabricated for testing. Numeric study results, client scenarios, thresholds, retention periods, incident priorities and architecture findings are synthetic unless explicitly attributed as claims made by the article.",
            )),
            ("Claim classes", paragraphs(
                "Class A records directly observable page metadata: article title, author, role, publication date, reading time, headings and named linked paper. Class B records paraphrased article statements, such as the privacy technologies and named regulations. Class C contains explanatory synthesis consistent with those themes. Class D contains deliberately fabricated examples and numeric fixtures.",
                "Bob should attribute Class B claims to the Atlas article when appropriate and never promote Class D values into real organisational facts. Retrieval metadata alone cannot enforce this distinction, so each document repeats synthetic warnings near high-risk numbers and scenarios.",
            )),
            ("Source page structure", paragraphs(
                "The page includes site navigation, research-library breadcrumb, title, date, reading time, author block, contents list, linked published paper, article sections, images, a regulatory table, newsletter and footer navigation. A production crawler should isolate the main article and exclude repeated menus, cookie notices and footer links from ordinary chunks.",
                "The linked paper uses a get-paper endpoint that refers to a PDF path. During corpus preparation, the page text was accessible but the apparent direct PDF path was not reliably retrievable. This synthetic corpus therefore does not claim to contain the actual published paper.",
            )),
            ("Chunking recommendations", paragraphs(
                "Chunk boundaries should respect headings and keep qualifiers with the claim they limit. A chunk containing a fabricated completion rate must also contain the sentence identifying it as synthetic. Regulatory rows can be grouped by region but should retain the law name and scope. Image descriptions should stay with captions and nearby explanatory text.",
                "Overlapping chunks can improve recall for long sections, but excessive duplication may crowd diverse evidence from the top results. Evaluation should test exact fact retrieval, cross-document synthesis, conflict handling, attribution and refusal to invent unavailable source details.",
            )),
            ("Retrieval evaluation set", paragraphs(
                "Suggested exact queries include: Who authored the Atlas secure-surveys article? What four privacy-preserving technologies does it name? Which notice had 71 percent completion in the fictional paper? What is Project Lantern? Which P1 remediation is due within thirty days? How long are invitation contacts retained in the synthetic playbook? What does visual B show? Why is the linked paper not represented as authentic?",
                "Suggested synthesis queries include: Compare differential privacy with small-cell suppression; explain why encryption alone is insufficient; distinguish GDPR special-category handling from the broader global matrix; and reconcile the source's positive trust claim with contradictory fictional studies. Out-of-scope tests should still be rejected by Bob's Atlas boundary.",
            )),
            ("Quality risks", paragraphs(
                "A language model may merge similarly named laws, present fictional numbers without warnings, treat a framework review as certification, or claim that every emerging technology is deployed. It may also overstate what generic image alt text reveals. Tests should explicitly detect those errors.",
                "Because the source article concerns laws and sensitive personal data, production answers should carry appropriate caveats and use current primary legal sources for decisions. This demo corpus assesses retrieval behaviour; it is not an approved compliance knowledge base.",
            )),
            ("Version record", paragraphs(
                "Corpus version atlas-research-synthetic-2026.08 was generated for local RAG testing. The internal compatibility key remains manager even though the user-facing assistant is Bob. All documents are marked synthetic and are physically separated from the Education index.",
                "Future real ingestion should retain canonical URL, crawl timestamp, content hash, publication and modification dates, author, media relationships, download status and superseded versions. Incremental promotion should occur only after retrieval evaluations pass.",
            )),
        ],
    },
    {
        "slug": "atlas-secure-survey-faq",
        "title": "Secure Diversity Survey - Detailed Questions and Answers",
        "document_type": "Research FAQ",
        "topics": ["FAQ", "secure survey", "anonymity", "trust", "privacy notice", "data minimisation"],
        "source_url": SOURCE_URL,
        "sections": [
            ("Is an anonymous survey the same as a confidential survey?", paragraphs(
                "No. Anonymous ordinarily means responses cannot reasonably be linked to an individual, while confidential means a link may exist but access and use are restricted. A survey using personalised invitation tokens may be confidential or pseudonymous during collection even if reports are anonymous at publication.",
                "The distinction should be explained plainly. Calling a survey anonymous while retaining an accessible identity mapping can damage trust and create legal risk.",
            )),
            ("Does encryption make a survey anonymous?", paragraphs(
                "No. Encryption protects information from parties without the necessary key or permission. Once decrypted for an authorised user, the content may still identify a respondent directly or through context. Anonymity also depends on collected fields, cohort size, free text, report filters and external knowledge.",
            )),
            ("Why collect identity data at all?", paragraphs(
                "Identity data can reveal whether experiences and opportunities differ across groups, support targeted inclusion work and help monitor change. Collection is justified only when tied to a clear purpose and proportionate method. More categories do not automatically create better insight, especially in small workforces.",
            )),
            ("What should a respondent notice contain?", paragraphs(
                "A useful notice identifies the responsible organisation, purpose, voluntary nature, question types, recipients, reporting safeguards, retention, transfers, individual rights, complaint route and contact. Layering allows a concise overview with access to detail. Technical language should be translated into its practical effect.",
            )),
            ("Can managers track who completed the survey?", paragraphs(
                "Campaign systems may track whether an invitation was delivered or completed without revealing answers. If completion status is visible to managers, the design should consider coercion and retaliation risk. The fictional governance model keeps reminder operations separate and does not expose raw answers to line managers.",
            )),
            ("What is data minimisation?", paragraphs(
                "Data minimisation means collecting and retaining only what is adequate, relevant and necessary for the approved purpose. It can involve removing fields, reducing precision, shortening retention, limiting free text and avoiding duplicate collection from other systems.",
            )),
            ("How are small groups protected?", paragraphs(
                "Common controls include minimum reporting thresholds, complementary suppression, restricted cross-tabs, query monitoring and review of exports. A threshold is not sufficient if repeated or overlapping queries can isolate a person. Organisational context matters because colleagues may already know team composition.",
            )),
            ("What is differential privacy?", paragraphs(
                "Differential privacy is a mathematical framework that limits how much an output depends on one person's record. Implementations often add calibrated noise and manage a cumulative privacy budget. It is most useful when the release model and accuracy trade-offs are understood.",
            )),
            ("Are global privacy laws all the same?", paragraphs(
                "No. They share themes such as transparency, purpose, security and individual rights, but definitions, legal bases, sensitive-data rules, employment provisions and transfer mechanisms vary. The regulatory matrix in this corpus is a research starting point, not legal advice.",
            )),
            ("What happens after a breach?", paragraphs(
                "The organisation should contain the issue, preserve evidence, determine affected data and people, assess harm and notification duties, communicate accurately and fix root causes. Notification timing and content depend on applicable law and contracts. Privacy and security specialists should guide the response.",
            )),
            ("Can Bob inspect the live Atlas website?", paragraphs(
                "In this local RAG implementation, Bob answers from a promoted static index. He does not browse or refresh the live website during each chat. Content must be crawled, validated, chunked and promoted before it becomes available to retrieval.",
            )),
            ("Which content is real and which is synthetic?", paragraphs(
                "The supplied article title, page metadata, named themes, technologies, laws and linked-paper metadata are derived from the public page. Extended studies, organisations, metrics, thresholds, retention schedules, incident details and architecture findings in this corpus are fabricated for evaluation.",
            )),
        ],
    },
]


def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D7DFD6"))
    canvas.line(18 * mm, 15 * mm, 192 * mm, 15 * mm)
    canvas.setFillColor(colors.HexColor("#5A6F68"))
    canvas.setFont("Helvetica", 7)
    canvas.drawString(18 * mm, 10 * mm, "SYNTHETIC ATLAS RESEARCH CORPUS - LOCAL RAG TESTING ONLY")
    canvas.drawRightString(192 * mm, 10 * mm, f"Page {document.page}")
    canvas.restoreState()


def generate_pdf(spec: dict, destination: Path) -> None:
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "AtlasTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23,
        leading=27, textColor=colors.HexColor("#173B34"), spaceAfter=12,
    )
    kicker = ParagraphStyle(
        "AtlasKicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8,
        leading=10, textColor=colors.HexColor("#D95843"), spaceAfter=15,
    )
    heading = ParagraphStyle(
        "AtlasHeading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14,
        leading=18, textColor=colors.HexColor("#173B34"), spaceBefore=14, spaceAfter=7,
        keepWithNext=True,
    )
    body = ParagraphStyle(
        "AtlasBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.2,
        leading=15.5, textColor=colors.HexColor("#314D46"), spaceAfter=9,
    )
    notice = ParagraphStyle(
        "AtlasNotice", parent=body, backColor=colors.HexColor("#FFF1ED"),
        borderColor=colors.HexColor("#EB7059"), borderWidth=0.7, borderPadding=9,
        textColor=colors.HexColor("#71382E"), spaceAfter=14,
    )
    doc = SimpleDocTemplate(
        str(destination), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=19 * mm, bottomMargin=21 * mm, title=spec["title"],
        author="Cultural Infusion Atlas synthetic RAG corpus",
        subject="Realistic synthetic research content derived from a supplied public Atlas article",
    )
    metadata = Table(
        [
            ["Document type", spec["document_type"]],
            ["Coverage", "Cultural Infusion Atlas - synthetic research snapshot"],
            ["Topics", " | ".join(spec["topics"])],
            ["Source inspiration", spec["source_url"]],
        ],
        colWidths=[36 * mm, 132 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E9EEE6")),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#173B34")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D7DFD6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]),
    )
    story = [
        Paragraph("BOB KNOWLEDGE LIBRARY / REALISTIC SYNTHETIC TEST CORPUS", kicker),
        Paragraph(escape(spec["title"]), title),
        metadata,
        Spacer(1, 12),
        Paragraph(
            "This document is a synthetic test artifact derived from themes and publicly visible metadata in the supplied Atlas article. It contains paraphrase, explanatory expansion and invented scenarios. It is not legal advice, a real client record, or a substitute for the original source and linked academic paper.",
            notice,
        ),
    ]
    for section_title, section_paragraphs in spec["sections"]:
        story.append(Paragraph(escape(section_title), heading))
        story.extend(Paragraph(escape(value), body) for value in section_paragraphs)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    expected = {f"{spec['slug']}.pdf" for spec in DOCUMENTS}
    for stale in OUTPUT.glob("*.pdf"):
        if stale.name not in expected:
            stale.unlink()

    inventory = []
    for spec in DOCUMENTS:
        path = OUTPUT / f"{spec['slug']}.pdf"
        generate_pdf(spec, path)
        inventory.append({
            "id": spec["slug"],
            "filename": path.name,
            "title": spec["title"],
            "jurisdiction": "CULTURAL INFUSION ATLAS - SYNTHETIC",
            "years": "Research snapshot 2025-2026",
            "topics": spec["topics"],
            "sourceUrl": spec["source_url"],
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "synthetic": True,
            "access": "manager",
        })
    manifest = {
        "corpus": "bob-atlas-realistic-synthetic",
        "access": "manager",
        "documentCount": len(inventory),
        "sourceInspiration": SOURCE_URL,
        "documents": inventory,
    }
    (OUTPUT / "corpus_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(inventory)} realistic Atlas PDFs in {OUTPUT}")


if __name__ == "__main__":
    main()
