"""Knowledge Distillation loss function per docs/ml.md F4 spec.

Total_Loss = alpha * CE_Loss(student_hard_pred, ground_truth)
           + (1-alpha) * KL_Div(student_logits/T, teacher_logits/T)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class KDLoss(nn.Module):
    """Knowledge Distillation loss combining hard and soft targets."""

    def __init__(self, alpha: float = 0.3, temperature: float = 4.0):
        super().__init__()
        self.alpha = alpha
        self.temperature = temperature
        self.ce_loss = nn.CrossEntropyLoss()

    def forward(
        self,
        student_logits: torch.Tensor,
        teacher_logits: torch.Tensor,
        ground_truth: torch.Tensor,
    ) -> torch.Tensor:
        """Compute KD loss.

        Args:
            student_logits: [B, C] raw student output
            teacher_logits: [B, C] raw teacher output
            ground_truth: [B] class indices
        """
        # Hard label loss
        hard_loss = self.ce_loss(student_logits, ground_truth)

        # Soft label loss (KL divergence with temperature scaling)
        T = self.temperature
        student_soft = F.log_softmax(student_logits / T, dim=1)
        teacher_soft = F.softmax(teacher_logits / T, dim=1)
        soft_loss = F.kl_div(student_soft, teacher_soft, reduction="batchmean") * (T * T)

        # Combined loss
        total = self.alpha * hard_loss + (1 - self.alpha) * soft_loss
        return total


class DetectionKDLoss(nn.Module):
    """KD loss adapted for YOLOv8 detection outputs."""

    def __init__(self, alpha: float = 0.3, temperature: float = 4.0):
        super().__init__()
        self.alpha = alpha
        self.temperature = temperature

    def forward(
        self,
        student_output: torch.Tensor,
        teacher_output: torch.Tensor,
        target: torch.Tensor,
    ) -> torch.Tensor:
        """Compute detection KD loss on classification heads.

        For detection models, we apply KD to the class prediction
        portion of the output tensors.
        """
        T = self.temperature

        # Extract class predictions (columns 4: onward in YOLO format)
        student_cls = student_output[..., 4:]
        teacher_cls = teacher_output[..., 4:]

        # Soft targets via KL divergence
        student_soft = F.log_softmax(student_cls / T, dim=-1)
        teacher_soft = F.softmax(teacher_cls / T, dim=-1)
        kd_loss = F.kl_div(student_soft, teacher_soft, reduction="batchmean") * (T * T)

        return kd_loss
