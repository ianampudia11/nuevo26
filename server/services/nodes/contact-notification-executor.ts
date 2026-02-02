/**
 * Contact Notification Node Executor
 * Handles execution of contact notification nodes in flow execution
 */

import { FlowExecutionContext } from '../flow-execution-context';
import channelManager from '../channel-manager';
import { storage } from '../../storage';

export interface ContactNotificationNodeData {
  phoneNumber: string;
  channelType: 'whatsapp_official' | 'whatsapp_unofficial' | 'twilio_sms';
  messageContent: string;
}

export interface ContactNotificationExecutionResult {
  success: boolean;
  messageId?: string;
  error?: string;
  data?: any;
}

/**
 * Execute a contact notification node
 * @param nodeData The node configuration data
 * @param context The flow execution context
 * @param companyId Optional company ID for multi-tenant support
 * @returns Execution result
 */
export async function executeContactNotificationNode(
  nodeData: ContactNotificationNodeData,
  context: FlowExecutionContext,
  companyId?: number
): Promise<ContactNotificationExecutionResult> {
  try {

    const phoneNumber = context.replaceVariables(nodeData.phoneNumber || '');
    const messageContent = context.replaceVariables(nodeData.messageContent || '');


    if (!phoneNumber || phoneNumber.trim() === '') {
      return {
        success: false,
        error: 'Phone number is required'
      };
    }


    if (!messageContent || messageContent.trim() === '') {
      return {
        success: false,
        error: 'Message content is required'
      };
    }


    let finalCompanyId = companyId;
    if (!finalCompanyId) {
      const flowCompanyId = context.getVariable('flow.companyId');
      if (flowCompanyId) {
        finalCompanyId = parseInt(String(flowCompanyId), 10);
      }
    }



    const result = await channelManager.sendDirectMessage(
      nodeData.channelType,
      phoneNumber,
      'text',
      messageContent,
      undefined, // No media URL for text messages
      undefined, // No subject (email not supported)
      finalCompanyId
    );

    if (result.success) {

      context.setContactNotificationResponse({
        success: true,
        messageId: result.messageId,
        channelType: nodeData.channelType,
        timestamp: new Date().toISOString(),
        data: result.data
      });

      context.setVariable('contactNotification.lastMessageId', result.messageId);
      context.setVariable('contactNotification.lastChannelType', nodeData.channelType);

      if (result.data) {
        Object.entries(result.data).forEach(([key, value]) => {
          context.setVariable(`contactNotification.${key}`, value);
        });
      }

      return {
        success: true,
        messageId: result.messageId,
        data: result.data
      };
    } else {
      const errorResult = {
        success: false,
        error: result.error || 'Failed to send notification'
      };


      context.setContactNotificationResponse({
        success: false,
        error: errorResult.error,
        channelType: nodeData.channelType,
        timestamp: new Date().toISOString()
      });

      context.setVariable('contactNotification.lastError', errorResult.error);

      return errorResult;
    }
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error occurred during contact notification execution';
    

    context.setContactNotificationResponse({
      success: false,
      error: errorMessage,
      channelType: nodeData.channelType,
      timestamp: new Date().toISOString()
    });

    context.setVariable('contactNotification.lastError', errorMessage);

    return {
      success: false,
      error: errorMessage
    };
  }
}
