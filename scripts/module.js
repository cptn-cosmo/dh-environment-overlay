const MODULE_ID = "dh-environment-overlay";
const FLAG_KEY = "environmentUuid";

Hooks.once("init", () => {
    console.log(`${MODULE_ID} | Initializing Daggerheart Environment Overlay`);

    game.settings.register(MODULE_ID, "borderColor", {
        name: "Overlay Border Color",
        hint: "Color of the environment token border.",
        scope: "world",
        config: true,
        type: String,
        default: "#ffcc00",
        onChange: () => renderEnvironmentOverlay()
    });

    game.settings.register(MODULE_ID, "showName", {
        name: "Show Actor Name",
        hint: "Display the environment actor's name below the token.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => renderEnvironmentOverlay()
    });
});

/**
 * Handle Scene Configuration Render
 */
Hooks.on("renderSceneConfig", async (app, html, data) => {
    // Determine if html is a jQuery object or HTMLElement
    const $html = html instanceof HTMLElement ? $(html) : html;

    // Target the Daggerheart specific tab
    const dhTab = $html.find('.tab[data-tab="dh"]');

    const environmentUuid = app.document.getFlag(MODULE_ID, FLAG_KEY);

    let currentActor = null;
    if (environmentUuid) {
        currentActor = await fromUuid(environmentUuid);
    }

    const dropZoneHtml = `
    <div class="form-group dh-environment-group">
        <label>Environment Actor</label>
        <div class="form-fields">
            <div class="dh-environment-wrapper" style="flex: 1;">
                ${currentActor ? `
                    <div class="dh-environment-info" data-uuid="${environmentUuid}">
                        <img class="dh-environment-img" src="${currentActor.img}" title="${currentActor.name}">
                        <span class="dh-environment-name">${currentActor.name}</span>
                        <i class="fas fa-times dh-environment-remove" title="Remove Link"></i>
                    </div>
                ` : `
                    <div class="dh-environment-drop-zone">
                        Drag & Drop Environment Actor Here
                    </div>
                `}
            </div>
        </div>
        <p class="notes">Link a Daggerheart Environment Actor to this scene. Its token will appear as an overlay.</p>
    </div>
    `;

    // Inject into the DH tab if it exists
    if (dhTab.length > 0) {
        dhTab.append(dropZoneHtml);
    } else {
        // Fallback: Try to put it in the first tab or top of form
        const form = $html.find("form");
        const nameGroup = $html.find("input[name='name']").closest(".form-group");
        if (nameGroup.length > 0) {
            nameGroup.after(dropZoneHtml);
        } else {
            form.prepend(dropZoneHtml);
        }
    }

    const dropZone = $html.find(".dh-environment-wrapper");

    // Add drag/drop listeners
    if (dropZone.length === 0) return;

    dropZone[0].addEventListener("dragover", (event) => {
        event.preventDefault();
        dropZone.find(".dh-environment-drop-zone").addClass("drag-hover");
    });

    dropZone[0].addEventListener("dragleave", (event) => {
        event.preventDefault();
        dropZone.find(".dh-environment-drop-zone").removeClass("drag-hover");
    });

    dropZone[0].addEventListener("drop", async (event) => {
        event.preventDefault();
        dropZone.find(".dh-environment-drop-zone").removeClass("drag-hover");

        try {
            const data = TextEditor.getDragEventData(event);
            if (data.type !== "Actor") return;

            const actor = await fromUuid(data.uuid);
            if (!actor || actor.type !== "environment") {
                ui.notifications.warn("DH Environment Overlay | Please drop a valid 'Environment' type Actor.");
                return;
            }

            updateDropZoneDisplay(dropZone, actor);

        } catch (err) {
            console.error(err);
        }
    });

    // Handle Remove
    dropZone.on("click", ".dh-environment-remove", () => {
        updateDropZoneDisplay(dropZone, null);
    });

    // Helper to update display and hidden input
    function updateDropZoneDisplay(wrapper, actor) {
        // Find or create hidden input
        let input = wrapper.find(`input[name="flags.${MODULE_ID}.${FLAG_KEY}"]`);
        if (input.length === 0) {
            input = $(`<input type="hidden" name="flags.${MODULE_ID}.${FLAG_KEY}">`);
            wrapper.append(input);
        }

        input.val(actor ? actor.uuid : "");

        const content = actor ? `
            <div class="dh-environment-info" data-uuid="${actor.uuid}">
                <img class="dh-environment-img" src="${actor.img}" title="${actor.name}">
                <span class="dh-environment-name">${actor.name}</span>
                <i class="fas fa-times dh-environment-remove" title="Remove Link"></i>
            </div>
        ` : `
            <div class="dh-environment-drop-zone">
                Drag & Drop Environment Actor Here
            </div>
        `;

        wrapper.children().not("input").remove();
        wrapper.append(content);
    }

    // Ensure hidden input exists for initial validation if null
    let existingInput = $html.find(`input[name="flags.${MODULE_ID}.${FLAG_KEY}"]`);
    if (existingInput.length === 0) {
        dropZone.append(`<input type="hidden" name="flags.${MODULE_ID}.${FLAG_KEY}" value="${environmentUuid || ""}">`);
    }

    // Force resize because we added content
    app.setPosition({ height: "auto" });

});

/**
 * Handle Overlay Rendering
 */
async function renderEnvironmentOverlay() {
    // Remove existing
    const existing = $("#dh-environment-overlay");
    if (existing.length) existing.remove();

    if (!canvas.scene) return;

    const environmentUuid = canvas.scene.getFlag(MODULE_ID, FLAG_KEY);
    if (!environmentUuid) return;

    try {
        const actor = await fromUuid(environmentUuid);
        if (!actor) return; // Maybe deleted?

        // PERMISSION CHECK
        // testUserPermission second arg "OBSERVER" means user needs at least OBSERVER level.
        // If users need only LIMITED, use "LIMITED". 
        // For opening the sheet (which we do on click), usually OBSERVER/OWNER is needed to see much,
        // but even LIMITED users can open sheet (partial view).
        // Let's assume OBSERVER is good to see the overlay (since they can see the token).
        // Actually, if it's an "Environment" actor, players might need at least Limited to interactions.
        // Let's stick to OBSERVER as safe default, or LIMITED if desired.
        // User said "players who have permissions to access the actor". 
        // This implies at least LIMITED.
        if (!actor.testUserPermission(game.user, "LIMITED")) {
            return;
        }

        const position = canvas.scene.getFlag(MODULE_ID, "overlayPosition") || { top: 100, right: 320 };
        const borderColor = game.settings.get(MODULE_ID, "borderColor");
        const showName = game.settings.get(MODULE_ID, "showName");

        let styleStr = "";
        if (position.left !== undefined) styleStr += `left: ${position.left}px;`;
        else if (position.right !== undefined) styleStr += `right: ${position.right}px;`;

        if (position.top !== undefined) styleStr += `top: ${position.top}px;`;
        else if (position.bottom !== undefined) styleStr += `bottom: ${position.bottom}px;`;

        const overlay = $(`
            <div id="dh-environment-overlay" title="${actor.name}" style="${styleStr}">
                <img src="${actor.img}" style="border-color: ${borderColor}">
                ${showName ? `<div class="dh-environment-overlay-name">${actor.name}</div>` : ""}
            </div>
        `);

        $("body").append(overlay);

        overlay.on("click", (event) => {
            // Prevent opening sheet if we just dragged
            if (overlay.data("isDragging")) return;
            actor.sheet.render(true);
        });

        // Drag Logic
        overlay.on("mousedown", (event) => {
            if (!event.altKey) return;

            event.preventDefault();
            event.stopPropagation();

            overlay.data("isDragging", true);

            // Get initial cursor offset relative to element
            const rect = overlay[0].getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;

            const moveHandler = (moveEvent) => {
                const x = moveEvent.clientX - offsetX;
                const y = moveEvent.clientY - offsetY;

                // Update specific styles to override CSS class
                overlay.css({
                    left: `${x}px`,
                    top: `${y}px`,
                    right: 'auto',
                    bottom: 'auto'
                });
            };

            const upHandler = async (upEvent) => {
                $(document).off("mousemove", moveHandler);
                $(document).off("mouseup", upHandler);

                // Small delay to prevent click trigger
                setTimeout(() => overlay.data("isDragging", false), 50);

                const rect = overlay[0].getBoundingClientRect();
                const newPos = {
                    left: rect.left,
                    top: rect.top
                };

                await canvas.scene.setFlag(MODULE_ID, "overlayPosition", newPos);
            };

            $(document).on("mousemove", moveHandler);
            $(document).on("mouseup", upHandler);
        });

    } catch (err) {
        console.warn(`${MODULE_ID} | Failed to load environment actor:`, err);
    }
}

Hooks.on("canvasReady", renderEnvironmentOverlay);
Hooks.on("updateScene", (document, change, options, userId) => {
    if (!document.isView) return;

    if (canvas.scene && document.id === canvas.scene.id) {
        if (hasProperty(change, `flags.${MODULE_ID}`)) {
            const flags = change.flags[MODULE_ID];
            if (flags) {
                if (flags[FLAG_KEY] !== undefined) {
                    renderEnvironmentOverlay();
                }
                else if (flags.overlayPosition && userId !== game.user.id) {
                    renderEnvironmentOverlay();
                }
            }
        }
    }
});
