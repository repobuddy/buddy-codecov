import { activate, compareCommand } from 'buddy-codecov'
import { expectTypeOf, it } from 'vitest'

it('exports the plugin surface from its built package', () => {
	expectTypeOf(activate).toBeFunction()
	expectTypeOf(compareCommand).toBeObject()
})
