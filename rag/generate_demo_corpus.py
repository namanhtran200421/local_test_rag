#!/usr/bin/env python3
"""Generate a clearly labelled synthetic PDF corpus for the Tan RAG demo."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "corpus" / "public"

DOCUMENTS = [
    {
        "slug": "national-cultural-learning-principles",
        "title": "National Cultural Learning Planning Principles",
        "jurisdiction": "AU",
        "years": "Foundation–Year 10",
        "topics": ["planning", "intercultural capability", "reflection"],
        "sections": [
            ("Purpose", "A practical planning companion for teachers selecting cultural learning experiences. Begin with a clear learning intention, identify what students already know, and select an experience that includes active participation and reflection."),
            ("Before the experience", "Introduce place, people and cultural context without reducing a culture to food, festivals or costume. Invite students to develop respectful questions. Explain that cultures are living, diverse and continually changing."),
            ("After the experience", "Use a notice, wonder, connect routine. Students record what they noticed, what they now wonder, and one connection to their classroom learning. Evidence may include annotated sketches, short reflections, group discussion notes or creative responses."),
        ],
    },
    {
        "slug": "vic-year5-arts-cultural-expression",
        "title": "Victoria Year 5 Arts: Cultural Expression Guide",
        "jurisdiction": "VIC",
        "years": "Year 5–6",
        "topics": ["music", "dance", "visual arts", "Victoria"],
        "sections": [
            ("Learning focus", "Students explore how artists communicate identity, place and community through movement, sound, image and story. They compare artistic choices and create a response using an agreed set of respectful protocols."),
            ("Suggested sequence", "Listen or observe closely, identify repeated patterns, discuss the cultural context supplied by the presenter, then compose a short group response. Students explain how one artistic choice contributes to meaning."),
            ("Evidence of learning", "Look for accurate use of arts vocabulary, careful observation, acknowledgement of cultural context and the ability to explain rather than simply describe an artistic choice."),
        ],
    },
    {
        "slug": "vic-intercultural-capability-year5",
        "title": "Victoria Year 5 Intercultural Capability Conversation Cards",
        "jurisdiction": "VIC",
        "years": "Year 5–6",
        "topics": ["identity", "perspective", "intercultural capability"],
        "sections": [
            ("Identity questions", "What communities help shape who we are? How can language, family, place and experience influence identity? Which parts of identity are visible, and which may not be visible?"),
            ("Perspective questions", "How might two people understand the same celebration differently? What information would help us avoid assumptions? How can we ask about difference with curiosity and respect?"),
            ("Reflection protocol", "Students privately write, discuss with a partner, then share only what they choose with the group. Teachers should not ask individual students to speak as representatives of a culture."),
        ],
    },
    {
        "slug": "nsw-stage3-creative-arts",
        "title": "NSW Stage 3 Creative Arts Cultural Workshop Companion",
        "jurisdiction": "NSW",
        "years": "Stage 3 / Years 5–6",
        "topics": ["creative arts", "music", "dance", "NSW"],
        "sections": [
            ("Workshop connection", "A cultural workshop can support students to perform, compose, appreciate and respond when classroom tasks focus on observable artistic elements and the context shared by the cultural educator."),
            ("Music lens", "Students identify duration, dynamics, tone colour and structure in a demonstrated piece. They can reproduce a short rhythmic pattern and describe how ensemble participation depends on listening and cooperation."),
            ("Dance lens", "Students observe use of space, time, dynamics and relationships. Any movement response should be adapted for safe participation and should not copy restricted or ceremonial material."),
        ],
    },
    {
        "slug": "nsw-stage3-geography-place",
        "title": "NSW Stage 3 Geography: Place, Culture and Connection",
        "jurisdiction": "NSW",
        "years": "Stage 3 / Years 5–6",
        "topics": ["geography", "place", "connection", "NSW"],
        "sections": [
            ("Inquiry focus", "Students investigate how people understand, value and care for places. Cultural knowledge shared during a program can be treated as one source within a broader geographical inquiry."),
            ("Source questions", "Who created this account? What place and community does it relate to? What can the source help us understand, and what can it not tell us? Which additional voices or sources should be included?"),
            ("Local action", "Students identify one realistic action that strengthens belonging or care for place at school. The action should be developed with relevant community input rather than assumed on behalf of others."),
        ],
    },
    {
        "slug": "qld-year5-humanities-community",
        "title": "Queensland Year 5 Humanities: Communities and Cultural Change",
        "jurisdiction": "QLD",
        "years": "Year 5",
        "topics": ["humanities", "community", "continuity", "change"],
        "sections": [
            ("Key idea", "Communities maintain traditions while also responding to migration, technology, environment and generational change. Students should look for both continuity and diversity within cultural groups."),
            ("Inquiry activity", "Create a timeline using only evidence supplied in the workshop and approved sources. Mark examples of continuity and change, then annotate where further evidence would be needed."),
            ("Avoiding generalisations", "Replace statements such as all people in a culture do this with evidence-based language such as the presenter described this practice in their community or family."),
        ],
    },
    {
        "slug": "qld-year5-arts-rhythm",
        "title": "Queensland Year 5 Arts: Rhythm, Movement and Ensemble",
        "jurisdiction": "QLD",
        "years": "Year 5–6",
        "topics": ["music", "rhythm", "movement", "ensemble"],
        "sections": [
            ("Rhythm investigation", "Students listen for pulse, subdivision, repeated patterns and call-and-response. They represent a pattern using accessible notation and perform it accurately as part of an ensemble."),
            ("Movement investigation", "Students explore how changes in energy, direction, level and formation affect an audience's experience. Movement tasks must allow seated and low-impact alternatives."),
            ("Ensemble reflection", "Students describe how attention, shared cues and recovery from mistakes contribute to group performance. Assessment should value collaboration as well as accuracy."),
        ],
    },
    {
        "slug": "sa-intercultural-understanding",
        "title": "South Australia Intercultural Understanding Reflection Pack",
        "jurisdiction": "SA",
        "years": "Years 4–8",
        "topics": ["empathy", "perspective", "reflection"],
        "sections": [
            ("Recognising perspectives", "Students distinguish observation from interpretation. They practise phrases such as I noticed, the presenter explained and I would need more information before concluding."),
            ("Empathy without assumption", "Empathy involves listening and responding respectfully; it does not mean claiming to know another person's experience. Students should identify the evidence behind their response."),
            ("Exit reflection", "Record one idea that challenged an assumption, one question for further inquiry and one action that could make classroom participation more inclusive."),
        ],
    },
    {
        "slug": "wa-arts-cultural-context",
        "title": "Western Australia Arts and Cultural Context Planning Notes",
        "jurisdiction": "WA",
        "years": "Years 4–8",
        "topics": ["arts", "context", "protocols"],
        "sections": [
            ("Context before technique", "Students should learn who is sharing an art form, its relevant social setting and any participation guidance before attempting a technique or creative response."),
            ("Creative response", "Invite students to apply a general artistic element such as contrast, repetition or structure to their own idea. Do not ask them to reproduce sacred, restricted or community-owned designs."),
            ("Teacher checklist", "Confirm terminology with the presenter, prepare accessible participation options, brief students on respectful questions and allow time for a reflective response after the workshop."),
        ],
    },
    {
        "slug": "act-civics-belonging",
        "title": "ACT Civics, Belonging and Participation Mini-Unit",
        "jurisdiction": "ACT",
        "years": "Years 5–6",
        "topics": ["civics", "belonging", "participation"],
        "sections": [
            ("Belonging", "Students examine how schools and communities communicate welcome and belonging. They identify formal rules and informal practices that influence who can participate."),
            ("Participation audit", "In small groups, students audit one school activity for physical, language, sensory and cultural accessibility. They propose an improvement and identify who should be consulted."),
            ("Civic action", "Students present a practical recommendation to a relevant school decision-maker, explain the evidence supporting it and invite feedback before implementation."),
        ],
    },
    {
        "slug": "program-sounds-of-country",
        "title": "Program Guide: Sounds of Country",
        "jurisdiction": "VIC, NSW, QLD, ACT",
        "years": "Foundation–Year 6",
        "topics": ["First Nations", "music", "storytelling"],
        "sections": [
            ("Program snapshot", "Sounds of Country is a 60-minute at-school experience combining First Nations music and storytelling. Cultural educators guide active listening and age-appropriate participation."),
            ("Classroom connections", "Possible connections include musical pattern, oral storytelling, connection to place and respectful listening. Exact curriculum alignment should be confirmed for the school's jurisdiction and current planning documents."),
            ("Preparation", "Share year level, access needs and learning intentions before the visit. Prepare students to listen respectfully and explain that not all cultural knowledge is public or appropriate to reproduce."),
        ],
    },
    {
        "slug": "program-living-culture",
        "title": "Program Guide: Living Culture",
        "jurisdiction": "VIC, NSW, ACT",
        "years": "Years 3–10",
        "topics": ["First Nations", "history", "living cultures"],
        "sections": [
            ("Program snapshot", "Living Culture is a 75-minute at-school introduction to the world's oldest continuing cultures. The program centres living knowledge, diversity and respectful engagement."),
            ("Classroom connections", "Teachers may connect the experience to history, geography, arts and intercultural learning. Avoid presenting First Nations peoples only in the past or treating one presenter's account as universal."),
            ("Follow-up", "Students compare a prior assumption with new evidence, identify a question for further research and acknowledge the source of cultural knowledge used in their response."),
        ],
    },
    {
        "slug": "program-rhythms-west-africa",
        "title": "Program Guide: Rhythms of West Africa",
        "jurisdiction": "VIC, NSW, QLD, SA",
        "years": "Foundation–Year 9",
        "topics": ["West Africa", "drumming", "dance", "ensemble"],
        "sections": [
            ("Program snapshot", "Rhythms of West Africa is a 50-minute at-school program using drumming, movement and call-and-response to explore rhythm and community participation."),
            ("Learning possibilities", "Students can identify pulse and repeated patterns, respond to musical cues and reflect on cooperation in ensemble performance. Cultural and regional context should be named specifically."),
            ("Inclusive participation", "Provide seated movement, body-percussion and observation roles. Check sound sensitivity needs in advance and ensure participation is invited rather than forced."),
        ],
    },
    {
        "slug": "program-journey-through-india",
        "title": "Program Guide: Journey Through India",
        "jurisdiction": "VIC, NSW, QLD, WA",
        "years": "Foundation–Year 8",
        "topics": ["India", "classical dance", "Bollywood", "story"],
        "sections": [
            ("Program snapshot", "Journey Through India is a 50-minute in-person or virtual program exploring Indian culture through selected classical and Bollywood dance traditions."),
            ("Learning possibilities", "Students observe gesture, facial expression, rhythm and narrative. Discussion should acknowledge the diversity of Indian languages, regions, religions and artistic traditions."),
            ("Creative response", "Students may create a short movement phrase using general ideas of level, direction and expression rather than copying culturally specific gestures without explanation."),
        ],
    },
    {
        "slug": "program-lunar-new-year",
        "title": "Program Guide: Celebrating Lunar New Year",
        "jurisdiction": "AU",
        "years": "Foundation–Year 6",
        "topics": ["Lunar New Year", "music", "dance", "stories"],
        "sections": [
            ("Program snapshot", "Celebrating Lunar New Year is a 45-minute in-person or virtual experience using music, dance and stories to introduce the diversity and meaning of Lunar New Year celebrations."),
            ("Language matters", "Use Lunar New Year when discussing the broader festival period and name specific community traditions when known. Avoid implying that every Asian community celebrates in the same way."),
            ("Classroom inquiry", "Students compare two sourced examples of celebration, identifying similarities, differences and the evidence used. Personal sharing should always be optional."),
        ],
    },
]


def footer(canvas, document):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#6D7B76"))
    canvas.setFont("Helvetica", 7)
    canvas.drawString(18 * mm, 11 * mm, "SYNTHETIC DEMO DOCUMENT — NOT OFFICIAL CURRICULUM ADVICE")
    canvas.drawRightString(192 * mm, 11 * mm, f"Page {document.page}")
    canvas.restoreState()


def generate_pdf(spec: dict, destination: Path) -> None:
    styles = getSampleStyleSheet()
    title = ParagraphStyle("TanTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=colors.HexColor("#173B34"), spaceAfter=12)
    kicker = ParagraphStyle("Kicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.HexColor("#D95843"), spaceAfter=18, uppercase=True)
    heading = ParagraphStyle("Heading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.HexColor("#173B34"), spaceBefore=14, spaceAfter=8)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.5, leading=17, textColor=colors.HexColor("#314D46"), spaceAfter=12)
    notice = ParagraphStyle("Notice", parent=body, backColor=colors.HexColor("#FFF1ED"), borderColor=colors.HexColor("#EB7059"), borderWidth=0.7, borderPadding=10, textColor=colors.HexColor("#7B3A30"), spaceAfter=18)
    doc = SimpleDocTemplate(str(destination), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm, bottomMargin=20 * mm, title=spec["title"], author="Tan MVP synthetic corpus")
    story = [
        Paragraph("TAN KNOWLEDGE LIBRARY · SYNTHETIC MVP CORPUS", kicker),
        Paragraph(spec["title"], title),
        Table(
            [["Jurisdiction", spec["jurisdiction"]], ["Suggested audience", spec["years"]], ["Topics", " · ".join(spec["topics"])]],
            colWidths=[38 * mm, 130 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E9EEE6")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#173B34")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#D7DFD6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]),
        ),
        Spacer(1, 15),
        Paragraph("This resource is invented for software demonstration and retrieval testing. It is not endorsed curriculum guidance, a statement of cultural authority, or a substitute for consultation with relevant communities and official curriculum bodies.", notice),
    ]
    for section_title, text in spec["sections"]:
        story.extend([Paragraph(section_title, heading), Paragraph(text, body)])
    story.extend([
        Paragraph("Planning prompts", heading),
        Paragraph("What should students understand or be able to do after the experience? Which claims require verification? How will students reflect without being asked to represent a culture? What access adjustments should be discussed with the provider?", body),
        Paragraph("Publication note", heading),
        Paragraph("Version: demo-2026.08 · Review status: synthetic and approved for local MVP testing only · Do not publish as factual curriculum advice.", body),
    ])
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    for spec in DOCUMENTS:
        path = OUTPUT / f"{spec['slug']}.pdf"
        generate_pdf(spec, path)
        inventory.append({
            "id": spec["slug"],
            "filename": path.name,
            "title": spec["title"],
            "jurisdiction": spec["jurisdiction"],
            "years": spec["years"],
            "topics": spec["topics"],
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "synthetic": True,
        })
    manifest = {"corpus": "tan-public-synthetic", "access": "public", "documentCount": len(inventory), "documents": inventory}
    (OUTPUT / "corpus_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(inventory)} synthetic PDFs in {OUTPUT}")


if __name__ == "__main__":
    main()
