import {ChevronDownIcon, ChevronUpIcon} from '@sanity/icons'
import {Box, Label} from '@sanity/ui'
import React, {FC} from 'react'
import {useDispatch} from 'react-redux'

import useTypedSelector from '../../hooks/useTypedSelector'
import {assetsSetOrder} from '../../modules/assets'

type Props = {
  field?: string
  title?: string
}

const TableHeaderItem: FC<Props> = (props: Props) => {
  const {field, title} = props

  // Redux
  const dispatch = useDispatch()
  const order = useTypedSelector(state => state.assets.order)

  const isActive = order.field === field

  // Callbacks
  const handleClick = () => {
    if (!field) {
      return
    }

    if (isActive) {
      dispatch(
        assetsSetOrder({
          field,
          direction: order.direction === 'asc' ? 'desc' : 'asc'
        })
      )
    } else {
      dispatch(
        assetsSetOrder({
          field,
          direction: 'asc'
        })
      )
    }
  }

  return (
    <Label muted={!field} size={1}>
      <Box
        onClick={field ? handleClick : undefined}
        style={{
          cursor: field ? 'pointer' : 'default',
          display: 'inline'
        }}
      >
        <span
          style={{
            marginRight: '0.4em'
          }}
        >
          {title}
        </span>

        {isActive && order?.direction === 'asc' && <ChevronUpIcon />}
        {isActive && order?.direction === 'desc' && <ChevronDownIcon />}
      </Box>
    </Label>
  )
}

export default TableHeaderItem
