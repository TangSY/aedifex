import { describe, expect, it } from 'vitest'
import { findTemplate } from '../building-templates'
import { generateExecutionPlan } from '../ai-planner'

const apartmentRequest = 'Design a 2-bedroom apartment of about 80 square meters: 2 bedrooms, 1 living room, 1 kitchen, 1 bathroom, with walls, doors and windows, and furnish each room appropriately.'

describe('building template matching', () => {
  it('matches the reported English request to the two-bedroom layout and staged plan', () => {
    const plan = generateExecutionPlan(apartmentRequest)
    expect(plan.template?.id).toBe('two-bedroom-apartment')
    expect(plan.template?.floors[0]?.rooms).toHaveLength(5)
    expect(plan.phased).toBe(true)
  })

  it.each([
    ['1-bedroom', 'one-bedroom-apartment'],
    ['1 bedroom', 'one-bedroom-apartment'],
    ['one-bedroom', 'one-bedroom-apartment'],
    ['one bedroom', 'one-bedroom-apartment'],
    ['1 bed', 'one-bedroom-apartment'],
    ['1 bedrooms', 'one-bedroom-apartment'],
    ['2-bedroom', 'two-bedroom-apartment'],
    ['2 bedroom', 'two-bedroom-apartment'],
    ['two-bedroom', 'two-bedroom-apartment'],
    ['two bedroom', 'two-bedroom-apartment'],
    ['2 bedrooms', 'two-bedroom-apartment'],
    ['two bedrooms', 'two-bedroom-apartment'],
    ['2 bed rooms', 'two-bedroom-apartment'],
    ['2-bed', 'two-bedroom-apartment'],
    ['TWO BEDROOM', 'two-bedroom-apartment'],
    ['2‑bedroom', 'two-bedroom-apartment'],
  ])('recognizes %s before generic room words', (description, id) => {
    expect(findTemplate(`Design a ${description} apartment with a living room and bathroom`)?.id).toBe(id)
  })

  it.each([
    ['2 story villa', 'villa-2-story'],
    ['two-story villa', 'villa-2-story'],
    ['2-storey villa', 'villa-2-story'],
    ['two floors in a villa', 'villa-2-story'],
    ['3 story villa', 'villa-3-story'],
    ['three-storey villa', 'villa-3-story'],
  ])('matches the explicit floor count in %s', (request, id) => {
    expect(findTemplate(request)?.id).toBe(id)
  })

  it.each(['bedroom', 'bathroom', 'mushroom', 'classroom', 'officeholder'])('does not match a substring inside %s', request => {
    expect(findTemplate(request)).toBeNull()
  })

  it.each(['3-bedroom', '21-bedroom', 'three bedroom'])('leaves unsupported %s apartments to generic planning', description => {
    expect(findTemplate(`Design a ${description} apartment with a living room`)).toBeNull()
  })

  it.each([
    ['two-bedroom-apartment', 'two-bedroom-apartment'],
    ['One-Bedroom Apartment', 'one-bedroom-apartment'],
    ['帮我做两室一厅', 'two-bedroom-apartment'],
    ['帮我做一室一厅', 'one-bedroom-apartment'],
    ['三层别墅', 'villa-3-story'],
    ['两层别墅', 'villa-2-story'],
    ['Studio Apartment', 'studio-apartment'],
    ['办公室', 'office-space'],
    ['single room', 'single-room'],
    ['设计一个房间', 'single-room'],
    ['Design a villa', 'villa-3-story'],
  ])('preserves the existing %s template', (request, id) => {
    expect(findTemplate(request)?.id).toBe(id)
  })
})
