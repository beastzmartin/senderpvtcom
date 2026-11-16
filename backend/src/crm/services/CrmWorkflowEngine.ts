import { getCrmDb } from '../db/index.js';
import {
  CrmWorkflow,
  CrmWorkflowRun,
  WorkflowStep,
  WorkflowTriggerType
} from '../models/types.js';
import { CrmComplianceService } from './CrmComplianceService.js';

export class CrmWorkflowEngine {
  private static instance: CrmWorkflowEngine | null = null;
  private isTicking: boolean = false;
  private timerInterval: NodeJS.Timeout | null = null;

  public static getInstance(): CrmWorkflowEngine {
    if (!CrmWorkflowEngine.instance) {
      CrmWorkflowEngine.instance = new CrmWorkflowEngine();
    }
    return CrmWorkflowEngine.instance;
  }

  public startTimer(intervalMs: number = 30000): void {
    if (this.timerInterval) return;
    this.timerInterval = setInterval(() => {
      this.tick().catch((err) => console.error('[CrmWorkflowEngine] Tick error:', err));
    }, intervalMs);
  }

  public stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Matches outbox/inbound events against active workflows and triggers runs
   */
  public async triggerEvent(
    workspaceId: string,
    eventType: WorkflowTriggerType,
    contactId: string,
    eventData: Record<string, any> = {}
  ): Promise<CrmWorkflowRun[]> {
    const db = getCrmDb();
    const workflows = await db.listWorkflows(workspaceId);
    const matchingWorkflows = workflows.filter((w) => w.is_active && w.trigger_type === eventType);

    const triggeredRuns: CrmWorkflowRun[] = [];

    for (const wf of matchingWorkflows) {
      // Create a workflow run
      const run = await db.createWorkflowRun(workspaceId, {
        workflow_id: wf.id,
        contact_id: contactId,
        status: 'running',
        current_step_index: 0,
        execution_context: {
          trigger_event: eventType,
          event_data: eventData,
          started_at: new Date().toISOString()
        }
      });

      // Execute steps asynchronously
      this.executeRun(run.id, workspaceId).catch((err) => {
        console.error(`[CrmWorkflowEngine] Error executing run ${run.id}:`, err);
      });

      triggeredRuns.push(run);
    }

    return triggeredRuns;
  }

  /**
   * State Machine: Executes steps of a workflow run sequentially
   */
  public async executeRun(runId: string, workspaceId: string): Promise<void> {
    const db = getCrmDb();
    const run = await db.getWorkflowRun(workspaceId, runId);
    if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return;
    }

    const workflow = await db.getWorkflow(workspaceId, run.workflow_id);
    if (!workflow) {
      await db.updateWorkflowRun(runId, { status: 'failed', error_message: 'Associated workflow not found' });
      return;
    }

    const contact = await db.getContact(workspaceId, run.contact_id);
    if (!contact) {
      await db.updateWorkflowRun(runId, { status: 'failed', error_message: 'Target contact not found' });
      return;
    }

    const steps = workflow.steps || [];
    let stepIndex = run.current_step_index;

    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      const startTime = Date.now();

      try {
        if (step.action_type === 'delay') {
          // Durable delay handler
          const delaySeconds = parseInt(step.config?.delay_seconds || '60', 10);
          const nextExecution = new Date(Date.now() + delaySeconds * 1000).toISOString();

          await db.updateWorkflowRun(runId, {
            status: 'waiting_delay',
            current_step_index: stepIndex,
            next_execution_at: nextExecution
          });

          await db.logWorkflowStepExecution({
            run_id: runId,
            workflow_id: workflow.id,
            step_index: stepIndex,
            action_type: 'delay',
            status: 'waiting',
            input_payload: { delay_seconds: delaySeconds },
            output_payload: { next_execution_at: nextExecution },
            duration_ms: Date.now() - startTime
          });

          // Halt current loop, will be resumed by tick() when timer matures
          return;
        }

        // Execute action step
        const stepResult = await this.executeStepAction(step, workspaceId, contact.id, run.execution_context);

        await db.logWorkflowStepExecution({
          run_id: runId,
          workflow_id: workflow.id,
          step_index: stepIndex,
          action_type: step.action_type,
          status: stepResult.success ? 'success' : 'skipped',
          input_payload: step.config,
          output_payload: stepResult.output,
          error_message: stepResult.errorMessage,
          duration_ms: Date.now() - startTime
        });

        // If condition check failed, stop workflow gracefully
        if (step.action_type === 'condition' && !stepResult.success) {
          await db.updateWorkflowRun(runId, {
            status: 'completed',
            current_step_index: stepIndex + 1,
            error_message: 'Condition evaluated false, workflow terminated gracefully'
          });
          return;
        }

        stepIndex++;
        await db.updateWorkflowRun(runId, {
          current_step_index: stepIndex
        });
      } catch (stepErr: any) {
        await db.logWorkflowStepExecution({
          run_id: runId,
          workflow_id: workflow.id,
          step_index: stepIndex,
          action_type: step.action_type,
          status: 'failed',
          input_payload: step.config,
          output_payload: {},
          error_message: stepErr.message,
          duration_ms: Date.now() - startTime
        });

        await db.updateWorkflowRun(runId, {
          status: 'failed',
          error_message: `Step ${stepIndex} (${step.action_type}) failed: ${stepErr.message}`
        });
        return;
      }
    }

    // Completed all steps
    await db.updateWorkflowRun(runId, {
      status: 'completed',
      current_step_index: steps.length
    });
  }

  /**
   * Executes an individual step action
   */
  private async executeStepAction(
    step: WorkflowStep,
    workspaceId: string,
    contactId: string,
    context: Record<string, any>
  ): Promise<{ success: boolean; output: Record<string, any>; errorMessage?: string }> {
    const db = getCrmDb();
    const compliance = CrmComplianceService.getInstance();
    const contact = await db.getContact(workspaceId, contactId);
    if (!contact) throw new Error('Contact missing during action execution');

    switch (step.action_type) {
      case 'send_whatsapp': {
        const canSend = await compliance.canSendMessage(workspaceId, contactId, 'whatsapp');
        if (!canSend.canSend) {
          return { success: false, output: { suppressed: true, reason: canSend.reason } };
        }

        const msgText = (step.config?.message_template || 'Hello {{first_name}}!')
          .replace('{{first_name}}', contact.first_name || 'there')
          .replace('{{company}}', contact.company_name || 'your team');

        await db.logActivity(workspaceId, {
          contact_id: contactId,
          type: 'whatsapp',
          title: 'Automated WhatsApp Message Sent',
          details: { message: msgText, step_id: step.id }
        });

        return { success: true, output: { delivered: true, channel: 'whatsapp', text_preview: msgText.slice(0, 60) } };
      }

      case 'send_email': {
        const canSend = await compliance.canSendMessage(workspaceId, contactId, 'email');
        if (!canSend.canSend) {
          return { success: false, output: { suppressed: true, reason: canSend.reason } };
        }

        const subject = (step.config?.subject || 'Important update')
          .replace('{{first_name}}', contact.first_name || 'there');

        await db.logActivity(workspaceId, {
          contact_id: contactId,
          type: 'email',
          title: `Automated Email Sent: ${subject}`,
          details: { subject, step_id: step.id }
        });

        return { success: true, output: { delivered: true, channel: 'email', subject } };
      }

      case 'update_field': {
        const fieldName = step.config?.field_name;
        const fieldValue = step.config?.field_value;
        if (!fieldName) throw new Error('update_field requires field_name in config');

        await db.updateContact(workspaceId, contactId, {
          [fieldName]: fieldValue
        });

        return { success: true, output: { updated_field: fieldName, new_value: fieldValue } };
      }

      case 'add_tag': {
        const tagName = step.config?.tag;
        if (tagName) {
          const tags = await db.listTags(workspaceId);
          let targetTag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
          if (!targetTag) {
            targetTag = await db.createTag(workspaceId, tagName);
          }
          await db.tagContacts(workspaceId, targetTag.id, [contactId]);
        }
        return { success: true, output: { added_tag: tagName } };
      }

      case 'remove_tag': {
        const tagName = step.config?.tag;
        if (tagName) {
          const tags = await db.listTags(workspaceId);
          const targetTag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
          if (targetTag) {
            await db.untagContacts(workspaceId, targetTag.id, [contactId]);
          }
        }
        return { success: true, output: { removed_tag: tagName } };
      }

      case 'add_to_list': {
        const listId = step.config?.list_id;
        if (listId) {
          await db.addContactsToList(workspaceId, listId, [contactId]);
        }
        return { success: true, output: { added_to_list_id: listId } };
      }

      case 'condition': {
        const field = step.config?.field || 'lead_score';
        const operator = step.config?.operator || 'gte';
        const expectedVal = step.config?.value !== undefined ? step.config.value : 50;

        const currentVal = (contact as any)[field];
        let conditionMet = false;

        if (operator === 'eq') conditionMet = currentVal === expectedVal;
        else if (operator === 'neq') conditionMet = currentVal !== expectedVal;
        else if (operator === 'gte') conditionMet = Number(currentVal) >= Number(expectedVal);
        else if (operator === 'lte') conditionMet = Number(currentVal) <= Number(expectedVal);
        else if (operator === 'gt') conditionMet = Number(currentVal) > Number(expectedVal);
        else if (operator === 'lt') conditionMet = Number(currentVal) < Number(expectedVal);

        return {
          success: conditionMet,
          output: { field, current_value: currentVal, operator, target_value: expectedVal, passed: conditionMet }
        };
      }

      case 'webhook_notify': {
        const targetUrl = step.config?.url;
        // In real execution, sends fetch(targetUrl, { method: 'POST', body: ... })
        return { success: true, output: { dispatched_to: targetUrl, status: 200 } };
      }

      default:
        return { success: true, output: { note: 'Action skipped' } };
    }
  }

  /**
   * Periodic scheduler tick: Checks for matured delays and resumes waiting runs
   */
  public async tick(): Promise<number> {
    if (this.isTicking) return 0;
    this.isTicking = true;
    try {
      const db = getCrmDb();
      const pendingRuns = await db.listPendingWorkflowRuns(100);

      for (const run of pendingRuns) {
        // Advance past delay step to next step
        await db.updateWorkflowRun(run.id, {
          status: 'running',
          current_step_index: run.current_step_index + 1,
          next_execution_at: null
        });

        // Resume execution
        await this.executeRun(run.id, run.workspace_id);
      }

      return pendingRuns.length;
    } finally {
      this.isTicking = false;
    }
  }
}
