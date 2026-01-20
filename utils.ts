import { AppointmentType } from './types';

export const normalizeType = (str: string) => (str || '').toLowerCase().trim();

export const translateType = (type: string, appointmentTypes: AppointmentType[]) => {
    const normalizedType = normalizeType(type);

    // 1. Direct match by value
    const match = appointmentTypes.find(t => normalizeType(t.value) === normalizedType);
    if (match) return match.label;

    // 2. Legacy/Fallback mapping
    const mappings: Record<string, string> = {
        'planning': 'Planejamento',
        'meeting': 'Reunião',
        'workshop': 'Oficina/Workshop',
        'sync': 'Sincronização',
        'design': 'Design',
        'client': 'Cliente',
        'qa': 'QA/Qualidade',
        'stakeholder': 'Stakeholder',
        'r': 'Reunião',
        'p': 'Planejamento'
    };

    if (mappings[normalizedType]) return mappings[normalizedType];

    // 3. Partial match or label match
    const partialMatch = appointmentTypes.find(t =>
        normalizeType(t.value).includes(normalizedType) ||
        normalizedType.includes(normalizeType(t.value)) ||
        normalizeType(t.label).includes(normalizedType)
    );
    if (partialMatch) return partialMatch.label;

    return type;
};

export const getTypeColor = (type: string, appointmentTypes: AppointmentType[]) => {
    const normalizedType = normalizeType(type);

    // 1. Direct match by value
    const match = appointmentTypes.find(t => normalizeType(t.value) === normalizedType);
    if (match) return match.color;

    // 2. Fallback searching for partial matches or common types
    if (normalizedType === 'planning' || normalizedType === 'p') {
        return appointmentTypes.find(t => normalizeType(t.label).includes('planej'))?.color || '#243f6b';
    }
    if (normalizedType === 'meeting' || normalizedType === 'r') {
        return appointmentTypes.find(t => normalizeType(t.label).includes('reuni'))?.color || '#3b82f6';
    }

    // 3. Last fallback
    const fallbackMatch = appointmentTypes.find(t =>
        normalizeType(t.value).includes(normalizedType) ||
        normalizedType.includes(normalizeType(t.value))
    );
    if (fallbackMatch) return fallbackMatch.color;

    return '#cbd5e1'; // Default slate color
};
