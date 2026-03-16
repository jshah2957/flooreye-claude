# Competitor Analysis
# Date: 2026-03-16

---

## SeeChange Technologies (seechange.com)

### Overview
SeeChange Technologies is a Manchester, UK-based computer vision company created in 2018 and spun out of Arm in 2021. They position themselves primarily as a **retail loss prevention** platform, with hazard detection (including spill detection) as one of several solutions. Their primary market is large retail chains in the UK and Europe. They partnered with Ocucon to create SpillDetect, the joint spill detection product. They also have a significant partnership with Mitie (UK facilities management) and Diebold Nixdorf (self-checkout hardware).

### Features
- **Spill Detection (SpillDetect):** Detects liquid spills (including clear liquids like water) using AI trained on thousands of real store images. Joint product with Ocucon.
- **Hazard Detection:** Identifies trip hazards, stacking hazards, and blocked exits for OSHA/HSE compliance.
- **Fire Safety Compliance:** Monitors fire exits, extinguishers, and blocked egress paths.
- **AI CCTV Analytics:** Connected store solution for loss prevention and security.
- **Self-Checkout AI:** Real-time monitoring of self-checkout transactions to detect theft and fraud.
- **Product Recognition:** AI-based product identification at point of sale.
- **Rules Engine:** Customizable sensitivity sliders for adjusting automation thresholds based on business needs.
- **Privacy Redaction:** Automatic redaction of personal information while monitoring behavior.
- **Intelligent Alerts:** Only alerts for true spill events, reducing false positives.
- **Notification Channels:** Automated announcements, email, SMS, and a web portal with annotated images + 30-second video clips.

### Technology
- **Architecture:** Edge-to-cloud hybrid. Processing can happen at the edge (in-store servers) or in the cloud depending on customer requirements.
- **Camera Support:** Works with existing CCTV infrastructure. Also integrates with barcode scanners, weighing scales, and touchscreen interactions at self-checkout.
- **AI Models:** Proprietary Vision AI models. Spill detection model trained on thousands of real-store images.
- **Platform:** SeeWare platform annotates images and feeds them into a decision engine.
- **Partners:** Diebold Nixdorf (hardware), Vigilant Applications (LiveStore software), Mitie (facilities management).

### Pricing
- Not publicly disclosed. Flexible licensing model where retailers select only features relevant to their needs. Enterprise sales model requiring direct contact for quotes.

### Strengths
- Spun out of Arm -- strong engineering pedigree and access to edge computing expertise.
- Broad retail solution beyond just spill detection (loss prevention, self-checkout, product recognition).
- Edge-to-cloud flexibility allows deployment in various network environments.
- Partnership with Ocucon adds specialized spill detection capabilities.
- Privacy-first approach with automatic personal data redaction.
- Established partnerships with major retail infrastructure providers (Diebold Nixdorf, Mitie).
- Rules engine allows business-level customization without technical expertise.
- Real store training data for spill models (not synthetic).

### Weaknesses
- **Retail-centric focus:** Primarily targets large retail chains; may not serve industrial, hospitality, or healthcare well.
- **No mobile app:** No evidence of a dedicated mobile app for store managers or maintenance teams.
- **No public API documentation:** No developer-facing API or integration testing tools visible.
- **Joint product dependency:** SpillDetect is a joint product with Ocucon, creating dependency on a partner for a core feature.
- **No model training pipeline for customers:** Customers cannot train or fine-tune their own models.
- **No edge agent OTA updates:** No evidence of over-the-air model update capabilities for edge devices.
- **UK/Europe focused:** Limited presence in North American market.
- **No real-time WebSocket dashboard:** Alert-based rather than continuous live monitoring.
- **Pricing opacity:** No self-service pricing; requires enterprise sales cycle.

---

## Visionify (visionify.ai)

### Overview
Visionify is a US-based company offering VisionAI, an AI-powered workplace safety platform. Unlike SeeChange which focuses on retail, Visionify targets **industrial and workplace safety** across manufacturing, warehousing, oil & gas, construction, and logistics. Spill detection is one of 30+ safety scenarios they support. They announced nationwide availability of VisionAI as a 24/7 industrial safety platform.

### Features
- **Spill and Leak Detection:** Detects water puddles, water leaks, chemical spills, fluid leaks, and slippery surfaces in real time.
- **Slip and Fall Detection:** Detects actual fall events for immediate assistance.
- **PPE Compliance:** Monitors hard hats, safety vests, gloves, goggles, and other protective equipment.
- **Smoke and Fire Detection:** Early detection of smoke and flames.
- **Forklift Safety:** Near-miss detection for forklift operations.
- **Debris and Obstruction Detection:** Identifies blocked pathways and work areas.
- **Exit Blocking Detection:** Monitors emergency exit accessibility.
- **Missing Fire Extinguisher Detection:** Tracks fire safety equipment presence.
- **Unsafe Climbing/Ladder Use:** Monitors ladder safety compliance.
- **Working at Heights:** Detects unprotected work at elevation.
- **Mobile Phone Usage Detection:** Identifies phone use during operations.
- **Suspended Load Detection:** Monitors overhead load hazards.
- **Restricted Area Access:** Tracks unauthorized zone entry.
- **Lone Worker Monitoring:** Ensures safety of isolated workers.
- **Occupancy Monitoring:** Tracks people counts in defined areas.
- **Android Mobile App:** Available on Google Play for workplace safety alerts.
- **Automated Alerts:** Real-time notifications to relevant personnel.
- **Precise Location Information:** Guides response teams to exact spill locations.
- **Cleanup Verification:** Documents successful containment and cleanup.

### Technology
- **Architecture:** Edge + Cloud hybrid. Processing happens on-premises using an Edge AI Server for privacy and low latency, with cloud services for storage, analytics, and remote access.
- **Edge Device:** Compact edge server that can run AI inference on up to 10 cameras simultaneously.
- **Camera Support:** Works with any existing IP camera systems including VMS and NVR setups. Requires RTSP streams. Supports ceiling-mounted and straight-mounted cameras.
- **Deployment Models:** Three flexible deployment options based on data residency, connectivity, and integration needs.
- **Documentation:** Full public developer docs at docs.visionify.ai.

### Pricing
- Not publicly listed with specific dollar amounts. Pricing determined by number of sites, number of cameras, and choice of solutions (pay for what you need). Custom quotes via pricing form. Enterprise-oriented pricing model.

### Strengths
- **Broadest scenario coverage:** 30+ workplace safety scenarios in a single platform, far beyond just spill detection.
- **Edge computing:** Dedicated edge server ensures low-latency detection and data privacy.
- **Mobile app:** Android app available for field alerts.
- **Public documentation:** Comprehensive docs site with deployment guides, camera placement guides, and scenario details.
- **Industrial focus:** Strong positioning for manufacturing, warehousing, oil & gas -- sectors with high compliance needs.
- **Flexible deployment:** Three deployment models accommodate various IT infrastructure requirements.
- **Cleanup verification:** Not just detection but also verifies that spills have been properly cleaned.
- **Camera agnostic:** Works with any IP camera via RTSP.

### Weaknesses
- **Jack of all trades:** 30+ scenarios may mean less depth in any single detection type compared to a specialist.
- **No custom model training:** No evidence customers can train their own models or refine detection for their specific environment.
- **Edge server limited to 10 cameras:** May require multiple edge servers for larger facilities.
- **No student-teacher model distillation:** Uses standard models rather than progressive learning approaches.
- **No detection control inheritance:** No evidence of hierarchical configuration (global > store > camera level).
- **Android only:** Mobile app appears to be Android-only (found on Google Play, no App Store listing observed).
- **No real-time video streaming dashboard:** Appears to be alert-based rather than continuous live frame viewing.
- **Pricing opacity:** Like competitors, requires custom quote.
- **No OTA model updates:** No evidence of automated model deployment to edge devices.

---

## Ocucon (ocucon.com)

### Overview
Ocucon is a Newcastle, UK-based technology company specializing in computer vision solutions for **retail loss prevention and health & safety**. They offer a platform built on their proprietary image recognition technology that works with existing CCTV infrastructure. Their product line includes SpillDetect (joint with SeeChange), HazardDetect, and Occupi (occupancy management). They also have a Microsoft Azure partnership for cloud infrastructure.

### Features
- **SpillDetect:** AI-powered liquid spill detection (including clear and non-clear liquids) through existing CCTV. Generates alerts with annotated images and 30-second video clips. World's first clear liquid detection claim.
- **HazardDetect:** Identifies blocked fire doors, emergency exits, fire extinguishers, and electrical panels. Continuous monitoring for health & safety compliance.
- **Occupi:** AI body detection for occupancy counting. Senses people entering/exiting stores. Real-time occupancy API for website integration.
- **Notification System:** Automated announcements, email, SMS, and portal-based alerts with annotated images and video.
- **Cleanup Audit Trail:** Documents spill detection, response time, and cleanup for compliance records.
- **OSHA/HSE Compliance:** Designed to help meet regulatory requirements with automated monitoring and documentation.
- **VMS Integration:** Integrates with existing video management systems.

### Technology
- **Architecture:** Primarily cloud-based. Uses high-performance computing hosted in the Ocucon cloud with NVIDIA A100 GPUs for processing.
- **Camera Support:** Works with existing CCTV infrastructure. Can be deployed on or off network. No additional hardware required (software-only solution).
- **Processing:** Regularly polls images from cameras (not continuous frame analysis). Can handle thousands of cameras via cloud GPU processing.
- **Cloud Infrastructure:** Microsoft Azure Stack for data sovereignty. NVIDIA A100 GPUs for inference.
- **Bandwidth:** Low-bandwidth solution -- sends images to cloud rather than streaming full video.

### Pricing
- Not publicly disclosed. Enterprise sales model with custom quotes. Contact required for installation quotes.

### Strengths
- **Cloud scalability:** NVIDIA A100 GPU infrastructure can process images from thousands of cameras without edge hardware.
- **Software-only deployment:** No additional hardware needed -- works purely with existing CCTV.
- **Clear liquid detection:** Claims to be first to detect clear liquid spills (water), which is technically harder than colored liquids.
- **Compliance documentation:** Built-in audit trail for regulatory compliance (OSHA, HSE).
- **Low bandwidth:** Image polling approach uses minimal network bandwidth.
- **Microsoft Azure partnership:** Enterprise-grade cloud infrastructure and data sovereignty options.
- **Multiple product lines:** SpillDetect, HazardDetect, and Occupi address different use cases from one vendor.

### Weaknesses
- **Cloud-dependent:** Primarily cloud processing means latency in detection. Image polling (not continuous analysis) introduces delays.
- **No edge processing option:** Despite claiming on/off network support, core processing relies on cloud GPUs. No dedicated edge inference device.
- **No mobile app:** No evidence of a mobile application for field teams.
- **No real-time dashboard:** Portal-based with alerts rather than continuous live monitoring.
- **No custom model training:** Customers cannot fine-tune models for their environment.
- **Polling-based detection:** Regularly polling images means spills between polling intervals may be missed or detected with delay.
- **SeeChange dependency:** SpillDetect is a joint product -- the AI engine (SeeWare) comes from SeeChange.
- **Limited detection types:** Only spills, hazards, and occupancy. No PPE, fall detection, or broader safety monitoring.
- **UK-focused:** Primarily serving UK retail market.
- **No API for third-party integrations:** No developer-facing API documentation visible.
- **No OTA updates or model registry:** No evidence of model versioning or automated deployment.

---

## Additional Competitors (Notable Mentions)

### IntelliSee (intellisee.com)
- Converts existing security cameras into AI-powered hazard sensors.
- Analyzes every frame 24/7 for visual patterns indicating slip risk (spills, leaks, icy walkways).
- Sends personalized alerts via SMS, email, or integrated security platforms.
- Differentiator: Single transparent price includes all detection features; new detections deployed automatically at no extra cost.
- Also covers threat detection and surveillance beyond safety.

### Scylla AI (scylla.ai)
- AI-powered Slip & Fall Detection using advanced video analytics.
- Processes batches of consecutive frames (3-5 second chunks) for analysis.
- Detects sit-and-fall and jump-and-fall events.
- Integrates with most modern VMS and cameras.
- Primarily a video surveillance AI company; slip/fall is one of many security-focused features.

### SafelyYou (safely-you.com)
- AI fall detection focused exclusively on **senior living** communities.
- Reduces falls, risk, and costs in care facilities.
- Not a direct competitor for retail/industrial but relevant in the fall detection AI space.

---

## FloorEye vs Competitors

### What FloorEye Has That Competitors Lack

1. **Hybrid Inference with Student-Teacher Model Distillation**
   - No competitor offers a student-teacher learning approach where a cloud-based Roboflow "teacher" model trains a lightweight YOLOv8 "student" model for edge deployment. This gives FloorEye both high accuracy (teacher) and low-latency edge inference (student) with continuous improvement.

2. **4-Layer Validation Pipeline**
   - FloorEye's detection goes through 4 validation layers before triggering alerts. No competitor mentions multi-stage validation -- most use single-model detection with threshold tuning. This should dramatically reduce false positives.

3. **Detection Control with 4-Layer Inheritance**
   - FloorEye's hierarchical configuration (Global > Organization > Store > Camera) allows granular control that cascades down. SeeChange has a rules engine but not a multi-level inheritance system. No other competitor offers this.

4. **Real-Time WebSocket Dashboard**
   - FloorEye provides continuous live frame viewing via WebSocket, not just alert-based monitoring. Competitors rely on periodic image polling (Ocucon) or alert notifications (Visionify, SeeChange) rather than real-time streaming.

5. **Dedicated Mobile App for Store Owners**
   - FloorEye has a purpose-built React Native mobile app (iOS + Android) for store owners with incident management, push notifications, and live monitoring. Only Visionify has a mobile app (Android only). SeeChange and Ocucon have no mobile apps.

6. **Automated Training Pipeline with Model Registry**
   - FloorEye includes dataset management, annotation tools, model training, and a versioned model registry. No competitor offers customer-accessible model training or a model registry.

7. **Edge Agent with OTA Model Updates**
   - FloorEye's edge agent supports over-the-air model updates, provisioning, heartbeat monitoring, and remote commands. No competitor demonstrates OTA model deployment to edge devices.

8. **API Integration Manager with Testing Console**
   - FloorEye provides an API integration manager with AES encryption and a testing console. No competitor offers a developer-facing API testing interface.

9. **ROI (Region of Interest) Tool**
   - FloorEye allows drawing specific regions of interest on camera views to focus detection on relevant areas. This reduces false positives from non-floor areas.

10. **Dry Reference Comparison**
    - FloorEye uses dry reference images for baseline comparison, enabling detection of subtle changes. No competitor mentions this technique.

### What Competitors Have That FloorEye Is Missing

1. **Broader Safety Scenario Coverage (Visionify)**
   - Visionify supports 30+ scenarios: PPE compliance, forklift safety, fire/smoke detection, ladder safety, phone usage detection, restricted area monitoring, lone worker safety. FloorEye focuses solely on wet floor/spill detection.

2. **Loss Prevention Integration (SeeChange)**
   - SeeChange integrates spill detection with self-checkout fraud detection, product recognition, and retail shrink reduction. FloorEye lacks any loss prevention features.

3. **Occupancy Management (Ocucon)**
   - Ocucon's Occupi provides real-time people counting and occupancy management with API feeds. FloorEye has no occupancy features.

4. **Fire Safety Compliance (SeeChange, Ocucon)**
   - Both SeeChange and Ocucon detect blocked fire exits, missing extinguishers, and fire door compliance. FloorEye does not monitor fire safety hazards.

5. **Privacy Redaction (SeeChange)**
   - SeeChange automatically redacts personal information from video feeds. FloorEye has no built-in privacy/PII redaction feature.

6. **Slip and Fall Event Detection (Visionify, Scylla)**
   - Visionify and Scylla detect actual fall events (person falling down), not just the hazard. FloorEye detects the spill but not the fall itself.

7. **Cleanup Verification (Visionify, Ocucon)**
   - Both verify that spills have been cleaned and document the cleanup for compliance. FloorEye detects spills and creates incidents but lacks explicit cleanup verification imaging.

8. **Established Enterprise Partnerships**
   - SeeChange has Arm, Diebold Nixdorf, Mitie, and Vigilant Applications. FloorEye is pre-partnership.

9. **NVIDIA A100 Cloud Processing (Ocucon)**
   - Ocucon leverages high-end GPU infrastructure for processing thousands of cameras. FloorEye's cloud inference uses Roboflow API rather than dedicated GPU clusters.

10. **Compliance Reporting and Audit Trails (Ocucon)**
    - Ocucon generates structured compliance reports with response time documentation for OSHA/HSE. FloorEye has system logs but no dedicated compliance reporting module.

### Recommendations to Beat Competitors (Prioritized)

#### Priority 1 -- High Impact, Low Effort
1. **Add Cleanup Verification**: After a spill is detected and assigned, use the same camera to verify the floor is dry again. Compare post-cleanup frame against the dry reference image. Close the incident automatically. This leverages existing dry reference infrastructure.

2. **Add Slip/Fall Event Detection**: Use the existing YOLOv8 pipeline to add a person-fall detection model. This turns FloorEye from "hazard detection" into "hazard + incident detection" -- a significantly stronger value proposition.

3. **Add Compliance Reporting Module**: Generate PDF/CSV reports showing detection time, notification time, response time, and cleanup time for each incident. Essential for OSHA/HSE compliance and insurance claims defense.

#### Priority 2 -- High Impact, Medium Effort
4. **Add Privacy/PII Redaction**: Implement face blurring or body anonymization on stored video clips and frames. Critical for GDPR (EU market) and increasingly important in US markets.

5. **Add Fire Safety Detection**: Detect blocked fire exits, missing fire extinguishers, and propped-open fire doors. Reuses the same camera infrastructure and extends the value proposition beyond spills.

6. **Add PPE Compliance Detection**: Hard hat, vest, and glove detection for industrial customers. Opens up manufacturing and warehouse verticals where Visionify is strong.

#### Priority 3 -- Strategic Differentiators
7. **Build Compliance Dashboard**: A dedicated dashboard showing OSHA/HSE compliance metrics, average response times, incident trends, and store-by-store safety scores. Insurance companies and corporate safety officers would pay premium for this.

8. **Add Occupancy Awareness to Detection**: Use people counting to correlate spill risk with foot traffic. High-traffic + spill = critical priority. Low-traffic + spill = standard priority. This is smart prioritization no competitor offers.

9. **Enterprise Partnership Program**: Pursue partnerships with facilities management companies (like SeeChange did with Mitie), POS/self-checkout vendors, and commercial cleaning companies to create distribution channels.

10. **Multi-Scenario Platform Evolution**: Gradually expand from spill-only to a broader safety platform (fire, PPE, falls, restricted areas) while maintaining the depth advantage in spill detection. Position as "the platform that started with the hardest problem (clear liquid detection) and expanded from there."

---

## Competitive Positioning Summary

| Capability | FloorEye | SeeChange | Visionify | Ocucon |
|---|---|---|---|---|
| Spill Detection | Yes | Yes (with Ocucon) | Yes | Yes (with SeeChange) |
| Clear Liquid Detection | Yes | Yes | Unclear | Yes (first claim) |
| Edge Inference | Yes (YOLOv8) | Yes | Yes (edge server) | No (cloud only) |
| Cloud Inference | Yes (Roboflow) | Yes | Yes | Yes (A100 GPUs) |
| Real-Time WebSocket | Yes | No | No | No |
| Mobile App | Yes (iOS + Android) | No | Android only | No |
| Model Training Pipeline | Yes | No | No | No |
| Student-Teacher Distillation | Yes | No | No | No |
| OTA Model Updates | Yes | No | No | No |
| 4-Layer Validation | Yes | No | No | No |
| Detection Control Inheritance | Yes (4-layer) | Rules Engine | No | No |
| ROI Drawing Tool | Yes | No | Unclear | No |
| Dry Reference Baseline | Yes | No | No | No |
| PPE Detection | No | No | Yes (30+ types) | No |
| Fall Event Detection | No | No | Yes | No |
| Fire Safety | No | Yes | Yes | Yes |
| Loss Prevention | No | Yes | No | No |
| Occupancy Counting | No | No | Yes | Yes |
| Privacy Redaction | No | Yes | No | No |
| Cleanup Verification | No | No | Yes | Yes |
| Compliance Reports | No | No | No | Yes |
| Public API Docs | Yes | No | Yes | No |

---

## Sources
- [SeeChange Hazard Detection](https://seechange.com/solutions/ai-hazard-detection-software/)
- [SeeChange Platform](https://seechange.com/platform/)
- [SeeChange Edge-to-Cloud](https://seechange.com/future-proofing-retail-with-edge-to-cloud-computing/)
- [SeeChange CCTV Software](https://seechange.com/solutions/ai-cctv-software/)
- [Visionify Spills and Leaks](https://visionify.ai/spills-and-leaks)
- [Visionify Scenarios](https://visionify.ai/scenarios)
- [Visionify Docs - Deployment](https://docs.visionify.ai/reference/deployment/)
- [Visionify Docs - Cameras](https://docs.visionify.ai/overview/cameras/)
- [Visionify Pricing](https://visionify.ai/pricing/)
- [Visionify How It Works](https://visionify.ai/how-it-works)
- [Visionify Slip and Fall](https://visionify.ai/slip-and-fall)
- [Ocucon SpillDetect](https://www.ocucon.com/products/spill-detection-system-for-monitoring-liquid-spills)
- [Ocucon HazardDetect](https://www.ocucon.com/products/hazard-detection-system-for-monitoring-osha-compliance)
- [Ocucon Products](https://www.ocucon.com/products)
- [Ocucon + SeeChange SpillDetect Announcement](https://pressreleases.responsesource.com/news/101407/seechange-ocucon-announce-spilldetect-reducing-slip-accidents-and-claims-/)
- [Ocucon Azure Stack](https://www.ocucon.com/resources/projects/microsoft-azure-cloud-stack-data-sovereignty-use-case-bicep)
- [IntelliSee Slip-Risk & Spill Detection](https://intellisee.com/what-we-do/slip-fall/)
- [Scylla Slip & Fall Detection](https://www.scylla.ai/slip-fall-detection/)
- [Ocucon + SeeChange Partnership (Loss Prevention Media)](https://losspreventionmedia.com/ai-solution-prevents-slip-fall-accidents/)
