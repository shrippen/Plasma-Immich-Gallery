import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

import "ImmichApi.js" as API

KCM.SimpleKCM {
    id: generalPage

    // cfg_ properties are auto-synced with KConfig keys by the Plasma framework.
    // Plasma injects ALL cfg_ keys into EVERY config page — declare them all here
    // so the framework doesn't log "Setting initial properties failed" warnings.
    property alias cfg_serverUrl: serverUrlField.text
    property alias cfg_apiKey:    apiKeyField.text
    property string cfg_viewMode:          "slideshow"
    property int    cfg_slideshowInterval: 5
    property int    cfg_refreshInterval:   300
    property int    cfg_photoCount:        30
    property string cfg_contentSource:     "recent"
    property string cfg_albumId:           ""
    property string cfg_albumName:         ""
    property string cfg_personId:          ""
    property string cfg_personName:        ""
    property bool   cfg_shufflePhotos:     false
    property bool   cfg_useAllPhotos:      false
    property double cfg_widgetOpacity:     1.0
    property bool   cfg_noBorder:          false

    // cfg_*Default stubs — Plasma injects these alongside cfg_* properties
    property string cfg_serverUrlDefault:        ""
    property string cfg_apiKeyDefault:           ""
    property string cfg_viewModeDefault:         "slideshow"
    property int    cfg_slideshowIntervalDefault: 5
    property int    cfg_refreshIntervalDefault:   300
    property int    cfg_photoCountDefault:        30
    property string cfg_contentSourceDefault:    "recent"
    property string cfg_albumIdDefault:          ""
    property string cfg_albumNameDefault:        ""
    property string cfg_personIdDefault:         ""
    property string cfg_personNameDefault:       ""
    property bool   cfg_shufflePhotosDefault:    false
    property bool   cfg_useAllPhotosDefault:     false
    property double cfg_widgetOpacityDefault:    1.0
    property bool   cfg_noBorderDefault:         false

    property string _testStatus: ""
    property bool   _testOk:     false

    Kirigami.FormLayout {
        anchors.fill: parent

        QQC2.TextField {
            id: serverUrlField
            Kirigami.FormData.label: i18n("Server URL:")
            placeholderText: "https://photos.example.com"
            inputMethodHints: Qt.ImhUrlCharactersOnly
            Layout.fillWidth: true
        }

        QQC2.TextField {
            id: apiKeyField
            Kirigami.FormData.label: i18n("API Key:")
            placeholderText: i18n("Paste your Immich API key here")
            echoMode: TextInput.Password
            Layout.fillWidth: true
        }

        RowLayout {
            Kirigami.FormData.label: ""

            QQC2.Button {
                text: i18n("Test Connection")
                icon.name: "network-connect"
                enabled: serverUrlField.text !== "" && apiKeyField.text !== ""
                onClicked: {
                    _testStatus = i18n("Testing…");
                    _testOk = false;
                    // Immich ping endpoint
                    API.apiGet(
                        serverUrlField.text.replace(/\/$/, "") + "/api/server/ping",
                        apiKeyField.text,
                        function(err, data) {
                            if (err) {
                                _testStatus = i18n("Connection failed: %1", err);
                                _testOk = false;
                            } else {
                                _testStatus = i18n("Connected successfully!");
                                _testOk = true;
                            }
                        }
                    );
                }
            }
        }

        QQC2.Label {
            Kirigami.FormData.label: ""
            visible: _testStatus !== ""
            text: _testStatus
            wrapMode: Text.Wrap
            Layout.fillWidth: true
            color: _testOk ? Kirigami.Theme.positiveTextColor : Kirigami.Theme.negativeTextColor
        }

        Kirigami.Separator {
            Kirigami.FormData.isSection: true
        }

        QQC2.Label {
            Kirigami.FormData.label: i18n("Note:")
            wrapMode: Text.Wrap
            Layout.fillWidth: true
            opacity: 0.7
            text: i18n("Generate an API key in the Immich web interface:") + "\n"
                + i18n("Account Settings \u2192 API Keys \u2192 New API Key")
                + "\n\n"
                + i18n("Required API key permissions:")
                + "\n  \u2022 Asset \u2014 Read"
                + "\n  \u2022 Asset \u2014 View"
                + "\n  " + i18n("\u2022 Album \u2014 Read  (%1)", i18n("Album source"))
                + "\n  " + i18n("\u2022 Person \u2014 Read  (%1)", i18n("People source"))
        }
    }
}
