import {Box} from '@sanity/ui'
import React, {FC} from 'react'
import {Controller, FieldError} from 'react-hook-form'
import CreatableSelect from 'react-select/creatable'

import useTypedSelector from '../../hooks/useTypedSelector'
import {reactSelectComponents, reactSelectStyles} from '../../styled/react-select/creatable'
import {ReactSelectOption} from '../../types'
import FormFieldInputLabel from '../FormFieldInputLabel'

type Props = {
  control: any
  description?: string
  disabled?: boolean
  error?: FieldError
  label: string
  name: string
  onCreateTag: (tagName: string) => void
  options: {
    label: string
    value: string
  }[]
  placeholder?: string
  value?: ReactSelectOption[] | null
}

const FormFieldInputTags: FC<Props> = (props: Props) => {
  const {
    control,
    description,
    disabled,
    error,
    label,
    name,
    onCreateTag,
    options,
    placeholder,
    value
  } = props

  // Redux
  const creating = useTypedSelector(state => state.tags.creating)

  return (
    <Box style={{zIndex: 9000}}>
      {/* Label */}
      <FormFieldInputLabel description={description} error={error} label={label} name={name} />

      {/* Select */}
      <Controller
        control={control}
        defaultValue={value}
        name={name}
        render={({onBlur, onChange, value: controllerValue}) => {
          return (
            <CreatableSelect
              cacheOptions={false}
              components={reactSelectComponents}
              defaultOptions
              instanceId="tags"
              isClearable={false} // TODO: re-enable when we're able to correctly (manually) re-validate on clear
              isDisabled={creating || disabled}
              isLoading={creating}
              isMulti
              name={name}
              noOptionsMessage={() => 'No tags'}
              onBlur={onBlur}
              onChange={onChange}
              onCreateOption={onCreateTag}
              options={options}
              placeholder={placeholder}
              styles={reactSelectStyles}
              value={controllerValue}
            />
          )
        }}
      />
    </Box>
  )
}

export default FormFieldInputTags
