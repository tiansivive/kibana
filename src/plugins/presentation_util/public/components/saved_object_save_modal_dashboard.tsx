/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo, useState } from 'react';

import { i18n } from '@kbn/i18n';

import {
  OnSaveProps,
  SavedObjectSaveModal,
  type SaveModalState,
} from '@kbn/saved-objects-plugin/public';

import { SaveModalDashboardProps } from './types';
import { SaveModalDashboardSelector } from './saved_object_save_modal_dashboard_selector';
import { getPresentationCapabilities } from '../utils/get_presentation_capabilities';

function SavedObjectSaveModalDashboard(props: SaveModalDashboardProps) {
  const { documentInfo, tagOptions, objectType, onClose, canSaveByReference } = props;
  const { id: documentId } = documentInfo;
  const initialCopyOnSave = !Boolean(documentId);

  const { canAccessDashboards, canCreateNewDashboards } = useMemo(() => {
    return getPresentationCapabilities();
  }, []);

  // Disable the dashboard options if the user can't access dashboards or if they're read-only
  const disableDashboardOptions = !canAccessDashboards || !canCreateNewDashboards;

  const [dashboardOption, setDashboardOption] = useState<'new' | 'existing' | null>(
    documentId || disableDashboardOptions ? null : 'existing'
  );
  const [isAddToLibrarySelected, setAddToLibrary] = useState<boolean>(
    canSaveByReference && (!initialCopyOnSave || disableDashboardOptions)
  );
  const [selectedDashboard, setSelectedDashboard] = useState<{ id: string; name: string } | null>(
    null
  );
  const [copyOnSave, setCopyOnSave] = useState<boolean>(initialCopyOnSave);

  const rightOptions = !disableDashboardOptions
    ? ({ hasAttemptedSubmit }: SaveModalState) => (
        <SaveModalDashboardSelector
          onSelectDashboard={(dash) => {
            setSelectedDashboard(dash);
          }}
          onChange={(option) => {
            setDashboardOption(option);
          }}
          canSaveByReference={canSaveByReference}
          {...{
            copyOnSave,
            documentId,
            dashboardOption,
            setAddToLibrary,
            isAddToLibrarySelected,
            hasAttemptedSubmit,
            hasSelectedDashboard: Boolean(selectedDashboard),
          }}
        />
      )
    : null;

  const onCopyOnSaveChange = (newCopyOnSave: boolean) => {
    if (canSaveByReference) {
      setAddToLibrary(true);
    }
    setDashboardOption(null);
    setCopyOnSave(newCopyOnSave);
  };

  const onModalSave = (onSaveProps: OnSaveProps) => {
    let dashboardId = null;

    // Don't save with a dashboard ID if we're
    // just updating an existing visualization
    if (!(!onSaveProps.newCopyOnSave && documentId)) {
      if (dashboardOption === 'existing') {
        dashboardId = selectedDashboard?.id || null;
      } else {
        dashboardId = dashboardOption;
      }
    }

    props.onSave({ ...onSaveProps, dashboardId, addToLibrary: isAddToLibrarySelected });
  };

  const saveLibraryLabel =
    !copyOnSave && documentId
      ? i18n.translate('presentationUtil.saveModalDashboard.saveLabel', {
          defaultMessage: 'Save',
        })
      : i18n.translate('presentationUtil.saveModalDashboard.saveToLibraryLabel', {
          defaultMessage: 'Save and add to library',
        });

  const saveDashboardLabel = i18n.translate(
    'presentationUtil.saveModalDashboard.saveAndGoToDashboardLabel',
    {
      defaultMessage: 'Save and go to Dashboard',
    }
  );

  const confirmButtonLabel = dashboardOption === null ? saveLibraryLabel : saveDashboardLabel;

  const isValid = !(dashboardOption === 'existing' && selectedDashboard === null);

  return (
    <SavedObjectSaveModal
      onSave={onModalSave}
      title={documentInfo.title}
      showCopyOnSave={documentId ? true : false}
      options={isAddToLibrarySelected ? tagOptions : undefined} // Show tags when not adding to dashboard
      description={documentInfo.description}
      showDescription={true}
      mustCopyOnSaveMessage={props.mustCopyOnSaveMessage}
      {...{
        confirmButtonLabel,
        initialCopyOnSave,
        isValid,
        objectType,
        onClose,
        onCopyOnSaveChange,
        rightOptions,
      }}
    />
  );
}

// required for dynamic import using React.lazy()
// eslint-disable-next-line import/no-default-export
export default SavedObjectSaveModalDashboard;
