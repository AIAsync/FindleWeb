document.addEventListener('DOMContentLoaded', () => {
    const monitoringBtn = document.getElementById('btn-monitoring');
    const notificationsBtn = document.getElementById('btn-notifications');
    const monitoringPanel = document.getElementById('panel-monitoring');
    const notificationsPanel = document.getElementById('panel-notifications');
    const overlay = document.getElementById('sidebar-overlay');

    function closeAllPanels() {
        monitoringPanel.classList.remove('open');
        notificationsPanel.classList.remove('open');
        monitoringBtn.classList.remove('active');
        notificationsBtn.classList.remove('active');
        document.body.classList.remove('workbench-open');
        monitoringPanel.classList.remove('maximized');
        notificationsPanel.classList.remove('maximized');
        const maxBtnMon = monitoringPanel.querySelector('.maximize-btn i');
        if (maxBtnMon) maxBtnMon.className = 'fa-regular fa-square';
        const maxBtnNot = notificationsPanel.querySelector('.maximize-btn i');
        if (maxBtnNot) maxBtnNot.className = 'fa-regular fa-square';
    }

    function togglePanel(panel, btn) {
        const isOpen = panel.classList.contains('open');
        closeAllPanels();

        if (!isOpen) {
            panel.classList.add('open');
            btn.classList.add('active');
            document.body.classList.add('workbench-open');
        }
    }

    if (monitoringBtn && monitoringPanel) {
        monitoringBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel(monitoringPanel, monitoringBtn);
        });
    }

    if (notificationsBtn && notificationsPanel) {
        notificationsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel(notificationsPanel, notificationsBtn);
        });
    }
    document.querySelectorAll('.close-workbench-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllPanels();
        });
    });

    document.querySelectorAll('.maximize-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = btn.closest('.workbench-panel');
            panel.classList.toggle('maximized');
            const icon = btn.querySelector('i');
            if (panel.classList.contains('maximized')) {
                icon.className = 'fa-regular fa-window-restore';
            } else {
                icon.className = 'fa-regular fa-square';
            }
        });
    });

    document.addEventListener('click', (e) => {
        if (monitoringPanel.classList.contains('open') &&
            !monitoringPanel.contains(e.target) &&
            !monitoringBtn.contains(e.target)) {
            closeAllPanels();
        }
        if (notificationsPanel.classList.contains('open') &&
            !notificationsPanel.contains(e.target) &&
            !notificationsBtn.contains(e.target)) {
            closeAllPanels();
        }
    });
});
