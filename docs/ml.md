PART F — AI & ML PIPELINE
═══════════════════════════════════════════════════════

F1. MODEL ARCHITECTURE

 ┌─────────────────────────────────────────────────────────┐
 │               FLOOREYE AI PIPELINE                       │
 │                                                         │
 │ ┌───────────────────┐     ┌───────────────────────────┐ │
 │ │ ROBOFLOW           │    │ STUDENT MODEL             │ │
 │ │ (Annotation Mgmt)  │    │ (Custom YOLO26)           │ │
 │ │                    │    │                           │ │
 │ │ Class sync         │    │ Object Detection          │ │
 │ │ Auto-labeling      │    │ Lightweight               │ │
 │ │ Frame upload       │    │ ~30–100ms (CPU)           │ │
 │ │                    │    │ Zero marginal cost        │ │
 │ │ ROLE:              │    │ ONNX for edge             │ │
 │ │ - Class mgmt       │    │ ROLE:                     │ │
 │ │ - Auto-labeling    │    │ - ALL live inference      │ │
 │ │ - Frame upload     │    │ - Edge-only detection     │ │
 │ │ - NOT live detect  │    │ - Primary on-device       │ │
 │ │                    │    │ - Improves with data      │ │
 │ └───────────────────┘     └───────────────────────────┘ │
 │            │                          ▲                  │
 │            │ Teacher labels           │ Distillation     │
 │            ▼                          │ training         │
 │ ┌──────────────────────────────────────────────────┐    │
 │ │            TRAINING DATA STORE                    │    │
 │ │ Frames + Teacher Soft Labels + Human Labels       │    │
 │ └──────────────────────────────────────────────────┘    │
 └─────────────────────────────────────────────────────────┘


F2. ROBOFLOW INTEGRATION (Annotation & Class Management ONLY)
     Roboflow-hosted instance segmentation model used for ANNOTATION only.
     NOT used for live detection — all live inference runs on edge ONNX student model.
     Used for: class sync, auto-labeling batch jobs, frame upload to Roboflow projects
     API calls:
       - GET https://api.roboflow.com/{project} (class sync)
       - POST /upload (training frame upload)
       - POST inference for auto-labeling batch jobs only (NOT live detection)


F3. STUDENT MODEL (Custom YOLO)
     Default architecture: YOLO26n (edge-friendly, NMS-free end-to-end)
     Edge deployment: ONNX Runtime (YOLO26 format only)
     Current edge model: student_v2.0.onnx (YOLO26n-format, [1,300,6] NMS-free output)
     Training: bootstrapped from COCO pretrained weights (not scratch)
     Deployment formats: ONNX Runtime (cross-platform) / TensorRT .engine (NVIDIA GPU) /
     PyTorch .pt (training/server)
     Classes: same as Roboflow project classes (imported via Roboflow class sync)
     Performance target: mAP@0.5 >= 0.75 for production promotion
     Note: predict.py detect_model_type() auto-detects format from ONNX output shape


F4. KNOWLEDGE DISTILLATION ALGORITHM
Loss function:

  Total_Loss = α × CE_Loss(student_hard_pred, ground_truth_label)
             + (1-α) × KL_Divergence(
                 student_logits / T,
                 teacher_logits / T
               )

  Where:
    α = 0.3         (weight on hard label loss)
    T = 4           (temperature — softens probability distribution)
    CE_Loss = standard cross-entropy
    KL_Divergence = Kullback-Leibler divergence on softened outputs


Why temperature softening: teacher's high-confidence predictions become softer, encoding
"near-miss" class relationships that hard labels miss. Student learns richer representations.
Implementation: Custom Ultralytics trainer subclass in training/distillation.py that
injects KD loss alongside standard detection loss.

F5. [REMOVED] HYBRID INFERENCE LOGIC
     Hybrid inference (student tries first, escalates to Roboflow teacher) has been removed.
     All live detection now runs exclusively on the edge ONNX student model.
     Roboflow API is only called for auto-labeling and class sync, never for live inference.


F6. PER-CLASS DETECTION CONTROL AT INFERENCE TIME
After raw inference results are returned, the validation_pipeline.py applies per-class filters:
    python

    def apply_class_filters(predictions, effective_settings):
        """
        Filter predictions using per-class settings resolved from detection control hier
        """
        filtered = []
        for pred in predictions:
            class_config = effective_settings.classes.get(pred.class_name)

             if class_config is None:
                 continue # Unknown class — skip

             if not class_config.enabled:
                 continue # Class disabled at this scope

             # Apply per-class confidence threshold
             min_conf = class_config.min_confidence or effective_settings.layer1_confiden
             if pred.confidence < min_conf:
                 continue

             # Apply per-class area threshold
             min_area = class_config.min_area_percent or effective_settings.layer2_area_t
             if pred.area_percent < min_area:
                 continue

             pred.severity = class_config.severity_mapping
             pred.should_alert = class_config.alert_on_detect
             filtered.append(pred)

        return filtered


F7. TRAINING JOB EXECUTION

    Celery worker (training_worker.py) receives task with job_config:

    1. Update job status → "running" in MongoDB

    2. Query training_frames:
       SELECT * FROM training_frames
       WHERE org_id = {org_id}
         AND included = true
         AND split IN ("train") -- or val
         AND created_at BETWEEN {date_from} AND {date_to}
         AND ({store_ids is empty} OR camera.store_id IN {store_ids})

    3. Download JPEG files from S3 to worker temp dir (/tmp/flooreye-training-
    {job_id}/)

    4. Generate Ultralytics dataset YAML:
   path: /tmp/flooreye-training-{job_id}
   train: images/train
   val: images/val
   nc: {num_classes}
   names: {class_names_list}

5. Initialize YOLO model from pretrained:
   model = YOLO("yolo26n.pt") # COCO pretrained base

6. Override Ultralytics trainer with FloorEyeDistillationTrainer:
   - Teacher model loaded in parallel
   - Combined CE + KL loss computed per batch

7. model.train(
     data=yaml_path,
     epochs=job_config.max_epochs,
     imgsz=job_config.image_size,
     batch=16,
     device="0" if GPU else "cpu",
     save=True,
     project="/tmp/flooreye-training-{job_id}"
   )

8. Per epoch: write metrics to MongoDB (for live chart in UI)

9. On completion: evaluate on val split → compute final mAP, precision, recall

10. Export to ONNX:
    model.export(format="onnx", imgsz=640, opset=12, simplify=True)

11. Export to TensorRT (if GPU available):
    model.export(format="engine", imgsz=640, half=True)

12. Upload weights to S3:
    s3.upload(f"models/{org_id}/{version}/student_{version}.onnx")
    s3.upload(f"models/{org_id}/{version}/student_{version}.pt")

13. Create model_versions document:
    {
      version: "v1.5.0",
      org_id: ...,
      architecture: "yolo26n",
      training_job_id: ...,
      frame_count: 18432,
      map_50: 0.847,
      map_50_95: 0.623,
      precision: 0.891,
      recall: 0.804,
      f1: 0.845,
      onnx_path: "s3://...",
      pt_path: "s3://...",
      status: "validating" if auto_promote_check else "draft"
      }

  14. Auto-promote check:
      if map_50 >= training_schedule.auto_promote_threshold:
        if map_50 > previous_production.map_50 + 0.01: # Must improve by 1%
          status = "staging" # Auto-promoted to staging, needs human to →
  production

  15. Update job status → "completed", set resulting_model_id

  16. Clean up temp files


F8. ACTIVE LEARNING SCORING
After each detection, if model source is "student":

  python

  def score_for_active_learning(detection_result):
      """
      Add to active learning queue if student confidence is below
      uncertainty threshold (needs human review).
      """
      if (detection_result.source == "student" and
          detection_result.max_confidence < ACTIVE_LEARNING_THRESHOLD):          # e.g., 0.75

           active_learning_queue.add({
               "detection_id": detection_result.id,
               "camera_id": detection_result.camera_id,
               "student_confidence": detection_result.max_confidence,
               "frame_base64": detection_result.frame_base64,
               "queued_at": datetime.utcnow()
           })


The Review Queue page (B11) surfaces these as the "Active Learning" tab, sorted by lowest
confidence first.
═══════════════════════════════════════════════════════
