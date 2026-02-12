/**
 * Pipeline Templates
 * Defines predefined pipeline templates for different business categories
 */

export interface PipelineTemplate {
    id: string;
    name: string;
    category: string;
    description: string;
    stages: Array<{
        name: string;
        color?: string;
        order: number;
    }>;
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
    {
        id: 'real-estate-sales',
        name: 'Real Estate Sales',
        category: 'real-estate',
        description: 'Standard pipeline for real estate property sales',
        stages: [
            { name: 'Lead', color: '#3b82f6', order: 0 },
            { name: 'Qualified', color: '#8b5cf6', order: 1 },
            { name: 'Property Viewing', color: '#ec4899', order: 2 },
            { name: 'Negotiation', color: '#f59e0b', order: 3 },
            { name: 'Closed Won', color: '#10b981', order: 4 },
            { name: 'Closed Lost', color: '#ef4444', order: 5 }
        ]
    },
    {
        id: 'sales-standard',
        name: 'Standard Sales Pipeline',
        category: 'sales',
        description: 'General sales pipeline for most businesses',
        stages: [
            { name: 'New Lead', color: '#3b82f6', order: 0 },
            { name: 'Contacted', color: '#8b5cf6', order: 1 },
            { name: 'Qualified', color: '#ec4899', order: 2 },
            { name: 'Proposal', color: '#f59e0b', order: 3 },
            { name: 'Negotiation', color: '#f97316', order: 4 },
            { name: 'Closed Won', color: '#10b981', order: 5 },
            { name: 'Closed Lost', color: '#ef4444', order: 6 }
        ]
    },
    {
        id: 'customer-support',
        name: 'Customer Support',
        category: 'support',
        description: 'Pipeline for customer support tickets',
        stages: [
            { name: 'New', color: '#3b82f6', order: 0 },
            { name: 'In Progress', color: '#f59e0b', order: 1 },
            { name: 'Waiting on Customer', color: '#8b5cf6', order: 2 },
            { name: 'Resolved', color: '#10b981', order: 3 },
            { name: 'Closed', color: '#6b7280', order: 4 }
        ]
    }
];

/**
 * Get a template by its ID
 */
export function getTemplateById(id: string): PipelineTemplate | undefined {
    return PIPELINE_TEMPLATES.find(template => template.id === id);
}

/**
 * Get all templates for a specific category
 */
export function getTemplatesByCategory(category: string): PipelineTemplate[] {
    return PIPELINE_TEMPLATES.filter(template => template.category === category);
}

/**
 * Format category label for display
 */
export function formatCategoryLabel(category: string): string {
    return category
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
