import {yupResolver} from '@hookform/resolvers/yup'
import {MutationEvent} from '@sanity/client'
import {Box, Button, Card, Dialog, Flex, Stack, Tab, TabList, TabPanel, Text} from '@sanity/ui'
import {Asset, DialogDetails, ReactSelectOption} from '@types'
import groq from 'groq'
import client from 'part:@sanity/base/client'
import React, {FC, ReactNode, useEffect, useRef, useState} from 'react'
import {useForm} from 'react-hook-form'
import {useDispatch} from 'react-redux'
import {AspectRatio} from 'theme-ui'
import * as yup from 'yup'

import useTypedSelector from '../../hooks/useTypedSelector'
import {assetsUpdate} from '../../modules/assets'
import {dialogRemove, dialogShowDeleteConfirm} from '../../modules/dialog'
import {tagsCreate} from '../../modules/tags'
import imageDprUrl from '../../utils/imageDprUrl'
import {isFileAsset, isImageAsset} from '../../utils/typeGuards'
import AssetMetadata from '../AssetMetadata'
import DocumentList from '../DocumentList'
import FileAssetPreview from '../FileAssetPreview'
import FormFieldInputFilename from '../FormFieldInputFilename'
import FormFieldInputTags from '../FormFieldInputTags'
import FormFieldInputText from '../FormFieldInputText'
import FormFieldInputTextarea from '../FormFieldInputTextarea'
import Image from '../Image'

type Props = {
  children: ReactNode
  dialog: DialogDetails
}

type FormData = yup.InferType<typeof formSchema>

const formSchema = yup.object().shape({
  originalFilename: yup.string().required('Filename cannot be empty')
})

// Sanitize form data: convert empty strings and undefined values to null.
// null values will correctly unset / delete fields
const sanitizeFormData = (formData: FormData) => {
  return Object.keys(formData).reduce((acc: Record<string, any>, key) => {
    if (formData[key] === '' || typeof formData[key] === 'undefined') {
      acc[key] = null
    } else {
      acc[key] = formData[key]
    }

    return acc
  }, {})
}

const getFilenameWithoutExtension = (asset?: Asset): string | undefined => {
  const extensionIndex = asset?.originalFilename?.lastIndexOf(`.${asset.extension}`)
  return asset?.originalFilename?.slice(0, extensionIndex)
}

const DialogDetails: FC<Props> = (props: Props) => {
  const {
    children,
    dialog: {assetId, id, lastCreatedTagId}
  } = props

  // Redux
  const dispatch = useDispatch()
  const byIds = useTypedSelector(state => state.assets.byIds)
  const item = byIds[assetId || '']
  const tagIds = useTypedSelector(state => state.tags.allIds)
  const tagsByIds = useTypedSelector(state => state.tags.byIds)

  const asset = item?.asset

  // Refs
  const isMounted = useRef(false)

  // State
  // - Generate a snapshot of the current asset
  const [assetSnapshot, setAssetSnapshot] = useState(asset)
  const [tabSection, setTabSection] = useState<'details' | 'references'>('details')

  const currentAsset = item ? asset : assetSnapshot

  const allTagOptions = tagIds.reduce((acc: ReactSelectOption[], id) => {
    const tag = tagsByIds[id]?.tag

    if (tag) {
      acc.push({
        label: tag?.name?.current,
        value: tag?._id
      })
    }

    return acc
  }, [])

  // Map tag references to react-select options, skip over items with nullish labels or values
  const generateTagOptions = (asset?: Asset): ReactSelectOption[] | null => {
    const tags = asset?.opt?.media?.tags?.reduce((acc: ReactSelectOption[], v) => {
      const tag = tagsByIds[v._ref]?.tag
      if (tag) {
        acc.push({
          label: tag?.name?.current,
          value: tag?._id
        })
      }
      return acc
    }, [])

    if (tags && tags?.length > 0) {
      return tags
    }

    return null
  }

  const generateDefaultValues = (asset?: Asset) => ({
    altText: asset?.altText || '',
    description: asset?.description || '',
    originalFilename: asset ? getFilenameWithoutExtension(asset) : undefined,
    opt: {
      media: {
        tags: generateTagOptions(asset)
      }
    },
    title: asset?.title || ''
  })

  // Generate a string from all current tag labels
  // This is used purely to determine tag updates to then update the form in real time
  const currentTagLabels = generateTagOptions(currentAsset)
    ?.map(tag => tag.label)
    .join(',')

  // react-hook-form
  const {control, errors, formState, getValues, handleSubmit, register, reset, setValue} = useForm({
    defaultValues: generateDefaultValues(asset),
    mode: 'onChange',
    resolver: yupResolver(formSchema)
  })

  // Callbacks
  const handleClose = () => {
    dispatch(dialogRemove(id))
  }

  const handleDelete = () => {
    if (!asset) {
      return
    }

    dispatch(
      dialogShowDeleteConfirm(asset._id, {
        closeDialogId: asset._id
      })
    )
  }

  const handleAssetUpdate = (update: MutationEvent) => {
    const {result, transition} = update

    if (result && transition === 'update') {
      // Regenerate asset snapshot
      setAssetSnapshot(result as Asset)

      // Reset react-hook-form
      reset(generateDefaultValues(result as Asset))
    }
  }

  const handleCreateTag = (tagName: string) => {
    // Dispatch action to create new tag
    dispatch(
      tagsCreate(tagName, {
        assetId: currentAsset?._id
      })
    )
  }

  // - submit react-hook-form
  const onSubmit = async (formData: FormData) => {
    if (!asset) {
      return
    }

    // Sanitize form data: convert empty strings and undefined values to null
    const sanitizedFormData = sanitizeFormData(formData)

    dispatch(
      assetsUpdate(
        asset,
        // Form data
        {
          ...sanitizedFormData,
          // Map tags to sanity references
          opt: {
            media: {
              ...sanitizedFormData.opt.media,
              tags:
                sanitizedFormData.opt.media.tags?.map((tag: ReactSelectOption) => ({
                  _ref: tag.value,
                  _type: 'reference',
                  _weak: true
                })) || null
            }
          },
          // Append extension to filename
          originalFilename: `${sanitizedFormData.originalFilename}.${asset.extension}`
        },
        // Options
        {
          closeDialogId: asset._id
        }
      )
    )
  }

  // Effects
  // - Listen for asset mutations and update snapshot
  useEffect(() => {
    if (!asset) {
      return
    }

    // Remember that Sanity listeners ignore joins, order clauses and projections
    const subscriptionAsset = client
      .listen(groq`*[_id == $id]`, {id: asset._id})
      .subscribe(handleAssetUpdate)

    return () => {
      subscriptionAsset?.unsubscribe()
    }
  }, [])

  // - Partially reset form when current tags have changed (and after initial mount)
  useEffect(() => {
    if (isMounted.current) {
      reset(
        {
          opt: {
            media: {
              tags: generateTagOptions(currentAsset)
            }
          }
        },
        {
          errors: true,
          dirtyFields: true,
          isDirty: true
        }
      )
    }

    // Mark as mounted
    isMounted.current = true
  }, [currentTagLabels])

  // - Update tags field with new tag if one has been created
  useEffect(() => {
    if (lastCreatedTagId) {
      const tag = tagsByIds[lastCreatedTagId]?.tag
      if (tag) {
        const existingTags = (getValues('opt.media.tags') as ReactSelectOption[]) || []
        const updatedTags = existingTags.concat([
          {
            label: tag.name.current,
            value: tag._id
          }
        ])

        setValue('opt.media.tags', updatedTags, {shouldDirty: true})
      }
    }
  }, [lastCreatedTagId])

  const Footer = () => (
    <Box padding={3}>
      <Flex justify="space-between">
        {/* Delete button */}
        <Button
          disabled={!item || item?.updating}
          fontSize={1}
          mode="bleed"
          onClick={handleDelete}
          text="Delete"
          tone="critical"
        />

        {/* Submit button */}
        <Button
          disabled={!item || item?.updating || !formState.isDirty || !formState.isValid}
          fontSize={1}
          onClick={handleSubmit(onSubmit)}
          text="Save and close"
          tone="primary"
        />
      </Flex>
    </Box>
  )

  return (
    <Dialog
      footer={<Footer />}
      header="Asset details"
      id={id}
      onClose={handleClose}
      scheme="dark"
      width={3}
    >
      {/*
        We reverse direction to ensure the download button doesn't appear (in the DOM) before other tabbable items.
        This ensures that the dialog doesn't scroll down to the download button (which on smaller screens, can sometimes
        be below the fold).
      */}
      <Flex direction={['column-reverse', 'column-reverse', 'row-reverse']}>
        <Box flex={1} marginTop={[5, 5, 0]} padding={4}>
          {/* Tabs */}
          <TabList space={2}>
            <Tab
              aria-controls="details-panel"
              disabled={!item}
              id="details-tab"
              label="Details"
              onClick={() => setTabSection('details')}
              selected={tabSection === 'details'}
              size={2}
            />
            <Tab
              aria-controls="references-panel"
              disabled={!item}
              id="references-tab"
              label="References"
              onClick={() => setTabSection('references')}
              selected={tabSection === 'references'}
              size={2}
            />
          </TabList>

          {/* Form fields */}
          <Box as="form" marginTop={4} onSubmit={handleSubmit(onSubmit)}>
            {/* Deleted notification */}
            {!item && (
              <Card marginBottom={3} padding={3} radius={2} shadow={1} tone="critical">
                <Text size={1}>This file cannot be found – it may have been deleted.</Text>
              </Card>
            )}

            {/* Hidden button to enable enter key submissions */}
            <button style={{display: 'none'}} tabIndex={-1} type="submit" />

            {/* Panel: details */}
            <TabPanel
              aria-labelledby="details"
              hidden={tabSection !== 'details'}
              id="details-panel"
            >
              <Stack space={3}>
                {/* Tags */}
                <FormFieldInputTags
                  control={control}
                  disabled={!item || item?.updating}
                  error={errors?.opt?.media?.tags}
                  label="Tags"
                  name="opt.media.tags"
                  onCreateTag={handleCreateTag}
                  options={allTagOptions}
                  placeholder="Select or create..."
                  value={generateTagOptions(currentAsset)}
                />
                {/* Filename */}
                <FormFieldInputFilename
                  disabled={!item || item?.updating}
                  error={errors?.originalFilename}
                  extension={currentAsset?.extension || ''}
                  label="Filename"
                  name="originalFilename"
                  ref={register}
                  value={getFilenameWithoutExtension(currentAsset)}
                />
                {/* Title */}
                <FormFieldInputText
                  disabled={!item || item?.updating}
                  error={errors?.title}
                  label="Title"
                  name="title"
                  ref={register}
                  value={currentAsset?.title}
                />
                {/* Alt text */}
                <FormFieldInputText
                  disabled={!item || item?.updating}
                  error={errors?.altText}
                  label="Alt Text"
                  name="altText"
                  ref={register}
                  value={currentAsset?.altText}
                />
                {/* Description */}
                <FormFieldInputTextarea
                  disabled={!item || item?.updating}
                  error={errors?.description}
                  label="Description"
                  name="description"
                  ref={register}
                  rows={3}
                  value={currentAsset?.description}
                />
              </Stack>
            </TabPanel>

            {/* Panel: References */}
            <TabPanel
              aria-labelledby="references"
              hidden={tabSection !== 'references'}
              id="references-panel"
            >
              <Box marginTop={5}>{asset && <DocumentList assetId={asset._id} />}</Box>
            </TabPanel>
          </Box>
        </Box>

        <Box flex={1} padding={4}>
          <AspectRatio ratio={1}>
            {/* File */}
            {isFileAsset(currentAsset) && <FileAssetPreview asset={currentAsset} />}

            {/* Image */}
            {isImageAsset(currentAsset) && (
              <Image
                draggable={false}
                showCheckerboard={!currentAsset?.metadata?.isOpaque}
                src={imageDprUrl(currentAsset, {height: 600, width: 600})}
              />
            )}
          </AspectRatio>

          {/* Metadata */}
          {currentAsset && (
            <Box marginTop={4}>
              <AssetMetadata asset={currentAsset} item={item} />
            </Box>
          )}
        </Box>
      </Flex>

      {children}
    </Dialog>
  )
}

export default DialogDetails
