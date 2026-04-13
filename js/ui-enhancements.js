// js/ui-enhancements.js — Global UI Enhancements
// Button loading states, page transitions, navigation helper, toasts

(function () {
    'use strict';

    // =========================================================
    // 1. BUTTON LOADING STATE
    // Usage: btnLoading(buttonEl, true)  → show spinner
    //        btnLoading(buttonEl, false) → restore original
    // =========================================================
    window.btnLoading = function (btn, isLoading) {
        if (!btn) return;

        if (isLoading) {
            // Save original dimensions to prevent any size change
            btn.style.minWidth = btn.offsetWidth + 'px';
            btn.style.minHeight = btn.offsetHeight + 'px';
            btn.disabled = true;
            btn.classList.add('btn-loading');

            // Add spinner if not already present
            if (!btn.querySelector('.btn-spinner-icon')) {
                const spinner = document.createElement('i');
                spinner.className = 'fa-solid fa-circle-notch fa-spin btn-spinner-icon';
                btn.appendChild(spinner);
            }
        } else {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
            btn.style.minWidth = '';
            btn.style.minHeight = '';
            const spinner = btn.querySelector('.btn-spinner-icon');
            if (spinner) spinner.remove();
        }
    };

    // =========================================================
    // 2. PAGE TRANSITION SYSTEM
    // Fade-in on page load, fade-out on navigation
    // =========================================================

    // Create the transition overlay
    const overlay = document.createElement('div');
    overlay.classList.add('page-transition-overlay');
    document.body.appendChild(overlay);

    // Fade in on load
    window.addEventListener('load', function () {
        document.body.classList.add('page-loaded');
        // Remove overlay after fade-in completes
        setTimeout(() => {
            overlay.classList.add('loaded');
        }, 50);
    });

    // =========================================================
    // 4. SMOOTH NAVIGATION HELPER
    // Usage: navigateTo('dashboard.html')
    // Fades out, then navigates
    // =========================================================
    window.navigateTo = function (url) {
        if (!url) return;

        // Add fade-out class
        overlay.classList.remove('loaded');
        overlay.classList.add('leaving');

        setTimeout(() => {
            window.location.href = url;
        }, 250); // Match CSS transition duration
    };

    // =========================================================
    // 5. SMOOTH RELOAD HELPER
    // Usage: smoothReload()
    // =========================================================
    window.smoothReload = function () {
        overlay.classList.remove('loaded');
        overlay.classList.add('leaving');

        setTimeout(() => {
            window.location.reload();
        }, 250);
    };

    // =========================================================
    // 6. TOAST NOTIFICATION SYSTEM
    // Usage: showToast('Test created!', 'success')
    //        showToast('Error occurred', 'error')
    // =========================================================
    let toastContainer = null;

    window.showToast = function (message, type) {
        type = type || 'info'; // 'success', 'error', 'info'

        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.classList.add('toast-container');
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.classList.add('toast', 'toast-' + type);

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };

        toast.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><span>' + message + '</span>';
        toastContainer.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-visible');
        });

        // Auto-dismiss
        setTimeout(() => {
            toast.classList.remove('toast-visible');
            toast.classList.add('toast-leaving');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

})();
